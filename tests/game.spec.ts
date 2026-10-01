import { test, expect, type Page } from '@playwright/test';
import type { GameScene } from '../src/scenes/GameScene';

type Snapshot = ReturnType<GameScene['snapshot']>;
const snapshot = (page: Page): Promise<Snapshot> => page.evaluate(() =>
  (window as unknown as { __NURO__: { snapshot: () => Snapshot } }).__NURO__.snapshot());

async function fixture(page: Page, code: string) {
  return page.evaluate(async script => {
    const entry = '/src/main.ts', physics = '/src/physics/matter.ts';
    const { game } = await import(/* @vite-ignore */ entry);
    const { Matter } = await import(/* @vite-ignore */ physics);
    return new Function('scene', 'Matter', script)(game.scene.getScene('GameScene'), Matter);
  }, code);
}
async function advance(page: Page, ms: number) {
  await fixture(page, `for (let i=0;i<${Math.ceil(ms/(1000/120))};i++) scene.update(0,1000/120);`);
}
async function start(page: Page) {
  await page.goto('/');
  await page.getByRole('button', {name:'PLAY',exact:true}).click();
  await expect.poll(async () => (await snapshot(page)).playing).toBe(true);
}

test('minimal menu, controls, no HUD, side-view scene and two-hand start', async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('button')).toHaveCount(2);
  await page.getByRole('button', {name:'CONTROLS',exact:true}).click();
  await expect(page.locator('.controls-list dd')).toHaveText(['Raise Legs','Rotate','Tuck','Twist','Release','Restart','Pause']);
  await page.getByRole('button', {name:'BACK',exact:true}).click();
  await page.getByRole('button', {name:'PLAY',exact:true}).click();
  await expect(page.locator('#ui')).toBeEmpty();
  await advance(page,1500);
  const s = await snapshot(page);
  expect(s.state).toBe('GRABBED');
  expect(s.grabs).toBe(2);
  expect(s.barId).toBe(0);
  expect(s.bars.length).toBe(5);
  expect(Math.abs(s.hands[0].x-s.hands[1].x)).toBeLessThan(9);
  expect(Math.abs(s.feet[0].x-s.feet[1].x)).toBeLessThan(12);
  expect(Math.abs(s.jointAngles.rightHip)).toBeLessThan(0.2);
  expect(s.speed).toBeLessThan(0.3);
  expect(Math.max(...s.joints.map(j=>j.error))).toBeLessThan(2);
  await page.screenshot({path:'test-results/sandbox.png'});
  expect(errors).toEqual([]);
});

test('W raises straight legs, pumps and lowers; L compacts the ragdoll', async ({page}) => {
  await start(page);
  await advance(page,500);
  const initial = await snapshot(page);
  await page.keyboard.down('w');
  await page.waitForTimeout(50);
  await advance(page,1100);
  const raised = await snapshot(page);
  expect(raised.jointAngles.rightHip).toBeLessThan(-1.6);
  expect(Math.abs(raised.jointAngles.rightKnee)).toBeLessThan(0.4);
  expect(raised.speed).toBeGreaterThan(initial.speed+0.1);
  await page.keyboard.up('w');
  await page.waitForTimeout(40);
  await advance(page,1300);
  expect(Math.abs((await snapshot(page)).jointAngles.rightHip)).toBeLessThan(0.5);
  await page.keyboard.down('l');
  await page.waitForTimeout(50);
  await advance(page,1100);
  const tucked = await snapshot(page);
  expect(tucked.jointAngles.rightKnee).toBeGreaterThan(1.7);
  expect(tucked.inertia).toBeLessThan(initial.inertia*0.8);
  await page.keyboard.up('l');
});

test('atomic release preserves every velocity; cooldown and no single-hand grab', async ({page}) => {
  await start(page);
  const released = await fixture(page,`
    for (const b of scene.gymnast.bodies) {Matter.Body.setVelocity(b,{x:2,y:-1});Matter.Body.setAngularVelocity(b,0.02);}
    const read=()=>scene.gymnast.bodies.map(b=>({x:b.position.x,y:b.position.y,vx:b.velocity.x,vy:b.velocity.y,w:b.angularVelocity}));
    const before=read(); scene.grabs.release(); const after=read();
    scene.grabs.step(50);
    return {before,after,state:scene.grabs.state,count:scene.grabs.count};
  `);
  expect(released.after).toEqual(released.before);
  expect(released.state).toBe('RELEASED');
  expect(released.count).toBe(0);
  await page.keyboard.press('Space');
  await page.waitForTimeout(40);
  expect((await snapshot(page)).grabs).toBe(0);
  const checks = await fixture(page,`
    scene.restart(); scene.grabs.release();
    const hands=scene.gymnast.hands;
    Matter.Body.translate(hands[1].body,{x:0,y:75});
    scene.grabs.step(500);
    const one=scene.grabs.count;
    Matter.Body.translate(hands[1].body,{x:0,y:-75});
    for(const h of hands){Matter.Body.setVelocity(h.body,{x:30,y:0});Matter.Body.setAngularVelocity(h.body,0);}
    scene.grabs.step(10);const tooFast=scene.grabs.count;
    for(const h of hands)Matter.Body.setVelocity(h.body,{x:1,y:-0.5});
    const read=()=>hands.map(h=>({x:h.body.position.x,y:h.body.position.y,vx:h.body.velocity.x,vy:h.body.velocity.y}));
    const before=read(); scene.grabs.step(10);
    return {one,tooFast,before,after:read(),both:scene.grabs.count,state:scene.grabs.state};
  `);
  expect(checks.one).toBe(0);
  expect(checks.tooFast).toBe(0);
  expect(checks.both).toBe(2);
  expect(checks.state).toBe('GRABBED');
  expect(checks.after).toEqual(checks.before);
});

test('two hands must reach the SAME bar, and every bar accepts both hands', async ({page}) => {
  await start(page);
  const result=await fixture(page,`
    const catches=[];
    const moveHand=(h,x,y)=>{
      const p=scene.gymnast.handPoint(h);
      Matter.Body.translate(h.body,{x:x-p.x,y:y-p.y});
      Matter.Body.setVelocity(h.body,{x:0,y:0});Matter.Body.setAngularVelocity(h.body,0);
    };
    scene.grabs.release();
    moveHand(scene.gymnast.hands[0],scene.level.bars[0].x,scene.level.bars[0].y);
    moveHand(scene.gymnast.hands[1],scene.level.bars[1].x,scene.level.bars[1].y);
    scene.grabs.step(500);const split=scene.grabs.count;
    for(const bar of scene.level.bars){
      scene.grabs.release();
      moveHand(scene.gymnast.hands[0],bar.x-2,bar.y+2);
      moveHand(scene.gymnast.hands[1],bar.x+2,bar.y+2);
      scene.grabs.step(500);
      catches.push({bar:scene.grabs.barId,count:scene.grabs.count});
    }
    return {split,catches};
  `);
  expect(result.split).toBe(0);
  expect(result.catches).toEqual([0,1,2,3,4].map(bar=>({bar,count:2})));
});

test('L supports flips and K retains twist momentum without any depth coordinate', async ({page}) => {
  await start(page);
  // Set a known free-flight initial condition; subsequent movement is real physics.
  await fixture(page,`
    scene.grabs.release();
    const c=scene.gymnast.center;
    for(const b of scene.gymnast.bodies){
      const dx=b.position.x-c.x,dy=b.position.y-c.y;
      Matter.Body.translate(b,{x:0,y:-1800});
      Matter.Body.setVelocity(b,{x:-dy*0.08,y:dx*0.08-5});
      Matter.Body.setAngularVelocity(b,0.08);
    }
  `);
  await page.keyboard.down('l');
  await page.keyboard.down('k');
  await page.waitForTimeout(50);
  await advance(page,1100);
  const powered=await snapshot(page);
  expect(Math.abs(powered.bodies[0].angle)).toBeGreaterThan(Math.PI*2);
  expect(powered.twistVelocity).toBeGreaterThan(2);
  await page.keyboard.up('k');
  await page.waitForTimeout(40);
  await advance(page,400);
  const coast=await snapshot(page);
  expect(coast.twistAngle).toBeGreaterThan(powered.twistAngle+0.5);
  expect(coast.twistVelocity).toBeGreaterThan(powered.twistVelocity*0.6);
  const planar=await fixture(page,"return scene.gymnast.bodies.every(b => !('z' in b.position) && !('z' in b.velocity));");
  expect(planar).toBe(true);
  await page.keyboard.up('l');
});

test('R repeatedly resets all velocities and removes old grips; Esc pauses/menu', async ({page}) => {
  await start(page);
  const states=await fixture(page,`
    const states=[];
    for(let i=0;i<30;i++){
      scene.grabs.release();scene.update(0,30);
      scene.controller.pending.add('restart');
      scene.update(0,16);
      states.push(scene.snapshot());
    }
    return states;
  `);
  for(const s of states as Snapshot[]){
    expect(s.grabs).toBe(2);
    expect(s.barId).toBe(0);
    expect(s.worldBodies).toBe(21);
    expect(s.worldConstraints).toBe(12);
    expect(s.bodies.every(b=>b.vx===0&&b.vy===0&&b.angularVelocity===0)).toBe(true);
    expect(s.twistVelocity).toBe(0);
  }
  await page.keyboard.press('r');
  await expect.poll(async()=>(await snapshot(page)).grabs).toBe(2);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  const paused=await snapshot(page);
  await advance(page,300);
  expect((await snapshot(page)).bodies).toEqual(paused.bodies);
  await page.getByRole('button',{name:'MENU',exact:true}).click();
  await expect(page.getByRole('button',{name:'PLAY',exact:true})).toBeVisible();
});

test('release retains swing velocity and follows a ballistic arc', async ({page}) => {
  await start(page);
  const result=await fixture(page, `
    const draw=scene.renderScene;scene.renderScene=()=>{};
    const trials=[];
    try {
      for(const pumpSteps of [30,60,90,120,150,180]){
        scene.restart();scene.controller.keys.right.isDown=true;
        for(let t=0;t<pumpSteps;t++)scene.update(0,1000/120);
        const before=scene.snapshot();
        scene.controller.pending.add('release');scene.update(0,0);
        const released=scene.snapshot();
        scene.controller.keys.right.isDown=false;
        const samples=[];
        for(let t=0;t<120;t++){
          scene.update(0,1000/120);
          if(scene.grabs.count)break;
          if(t%6===5)samples.push({t:(t+1)/120,x:scene.gymnast.center.x,y:scene.gymnast.center.y,vx:scene.gymnast.velocity.x,vy:scene.gymnast.velocity.y});
        }
        trials.push({pumpSteps,before: {center:before.center,velocity:before.velocity},same:JSON.stringify(before.bodies)===JSON.stringify(released.bodies),samples});
      }
    }finally{scene.renderScene=draw;scene.restart();}
    return trials;
  `);
  type Trial = { pumpSteps:number; same:boolean; before:{center:{x:number;y:number};velocity:{x:number;y:number}}; samples:{t:number;x:number;y:number;vx:number;vy:number}[] };
  const trials=result as Trial[];
  expect(trials.every(r=>r.same)).toBe(true);
  for(const trial of trials){
    const sample=trial.samples.find(s=>s.t===0.2)!;
    const expectedX=trial.before.center.x+trial.before.velocity.x*sample.t;
    const expectedY=trial.before.center.y+trial.before.velocity.y*sample.t+0.5*950*sample.t**2;
    expect(Math.abs(sample.x-expectedX)).toBeLessThan(2);
    expect(Math.abs(sample.y-expectedY)).toBeLessThan(2);
    expect(Math.abs(sample.vx)).toBeGreaterThan(Math.abs(trial.before.velocity.x)*0.98);
  }
  const weak=trials.find(t=>t.pumpSteps===30)!;
  const strong=trials.find(t=>t.pumpSteps===90)!;
  expect(strong.before.velocity.x).toBeGreaterThan(150);
  expect(strong.before.velocity.y).toBeLessThan(-150);
  expect(strong.samples[0].x).toBeGreaterThan(strong.before.center.x);
  expect(strong.samples[0].y).toBeLessThan(strong.before.center.y);
  expect(strong.samples.some(s=>s.vy>100)).toBe(true);
  const at=(trial:Trial)=>trial.samples.find(s=>s.t===0.4)!;
  expect(at(strong).x-strong.before.center.x).toBeGreaterThan((at(weak).x-weak.before.center.x)*1.8);
});

test('transfer exploration', async ({page}) => {
  test.setTimeout(120000);
  await start(page);
  const result = await fixture(page, `
    const draw = scene.renderScene; scene.renderScene=()=>{};
    const candidates=[]; const winners=[];
    try {
      for(let releaseStep=0;releaseStep<=400;releaseStep+=10){
        for(const airDirection of [0,1,-1]){
          for(const tuckSteps of [0,30,60]){
            scene.restart(); scene.controller.keys.right.isDown=true;
            for(let t=0;t<296;t++)scene.update(0,1000/120);
            scene.grabs.release();scene.controller.keys.right.isDown=false;
            for(let t=0;t<250&&!scene.grabs.count;t++)scene.update(0,1000/120);
            if(scene.grabs.barId!==1)throw new Error('First transfer failed');
            scene.controller.keys.right.isDown=true;
            for(let t=0;t<releaseStep;t++){
              scene.update(0,1000/120);
            }
            scene.grabs.release(); scene.controller.keys.right.isDown=airDirection===1;scene.controller.keys.left.isDown=airDirection===-1;
            let closest=10000, caught=null, speeds=[];
            for(let t=0;t<250;t++){
              scene.controller.keys.tuck.isDown=t<tuckSteps;
              scene.update(0,1000/120);
              const bar=scene.level.bars[2];
              const distance=Math.max(...scene.gymnast.hands.map(h=>{const p=scene.gymnast.handPoint(h);return Math.hypot(p.x-bar.x,p.y-bar.y);}));
              if(distance<closest){closest=distance;speeds=scene.gymnast.hands.map(h=>scene.grabs.handSpeed(h));}
              if(scene.grabs.count){caught=scene.grabs.barId;break;}
            }
            const record={releaseStep,airDirection,tuckSteps,closest,caught,speeds};
            candidates.push(record);if(caught===2)winners.push(record);
          }
        }
      }
    } finally {scene.renderScene=draw;scene.restart();}
    return {winners:winners.slice(0,12),sameBar:candidates.filter(c=>c.caught===0).slice(0,3),closest:candidates.sort((a,b)=>a.closest-b.closest).slice(0,6)};
  `);
  console.log(JSON.stringify(result));
  expect(result.winners.length).toBeGreaterThan(0);
});
