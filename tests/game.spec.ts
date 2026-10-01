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
  await expect(page.locator('.controls-list dd')).toHaveText(['Straight','Tuck','Twist','Release','Restart','Pause']);
  await page.getByRole('button', {name:'BACK',exact:true}).click();
  await page.getByRole('button', {name:'PLAY',exact:true}).click();
  await expect(page.locator('#ui')).toBeEmpty();
  await advance(page,1500);
  const s = await snapshot(page);
  expect(s.state).toBe('GRABBED');
  expect(s.grabs).toBe(2);
  expect(s.barId).toBe(0);
  expect(s.bars.length).toBe(2);
  expect(s.bars[1].x).toBeGreaterThan(s.bars[0].x);
  expect(s.bars[1].y).toBeLessThan(s.bars[0].y-40);
  expect(s.bars.every(bar => !bar.isSensor)).toBe(true);
  expect(Math.abs(s.hands[0].x-s.hands[1].x)).toBeLessThan(9);
  expect(Math.abs(s.feet[0].x-s.feet[1].x)).toBeLessThan(12);
  expect(s.jointAngles.rightHip).toBeLessThan(-1.8);
  expect(s.jointAngles.spine).toBeLessThan(-0.15);
  expect(Math.max(...s.joints.map(j=>j.error))).toBeLessThan(2);
  await page.screenshot({path:'test-results/sandbox.png'});
  expect(errors).toEqual([]);
});

test('high base pose, W straight, stronger L tuck and smooth return', async ({page}) => {
  await start(page);
  const poses=await fixture(page,`
    scene.restart();const poses=[];
    for(const [pose,steps] of [['base',240],['straight',180],['base',180],['tuck',180],['base',180]]){
      scene.controller.keys.straight.isDown=pose==='straight';scene.controller.keys.tuck.isDown=pose==='tuck';
      for(let t=0;t<steps;t++)scene.update(0,1000/120);
      poses.push(scene.snapshot());
    }
    return poses;
  `) as Snapshot[];
  const [base,straight,afterW,tuck,afterL]=poses;
  console.log(poses.map(s=>({pose:s.pose,angles:s.jointAngles,pelvis:s.bodies.find(b=>b.label==='nuro:pelvis'),feet:s.feet,inertia:s.inertia})));
  for(const s of [base,afterW,afterL]){
    expect(s.pose).toBe('base');
    expect(s.jointAngles.rightHip).toBeLessThan(-1.8);
    expect(s.jointAngles.rightHip+s.jointAngles.spine).toBeGreaterThan(-2.85);
    expect(s.jointAngles.rightKnee).toBeGreaterThan(0.08);
    expect(s.jointAngles.rightKnee).toBeLessThan(0.5);
    expect(s.jointAngles.spine).toBeLessThan(-0.15);
    expect(s.jointAngles.spine).toBeGreaterThan(-0.55);
    expect(Math.abs(s.jointAngles.neck)).toBeLessThan(0.1);
    expect(Math.abs(s.jointAngles.rightShoulder)).toBeLessThan(0.7);
    expect(Math.max(...s.feet.map(f=>f.y))).toBeLessThan(straight.feet[0].y-120);
    expect(Math.abs(s.hands[0].x-s.hands[1].x)).toBeLessThan(12);
  }
  expect(straight.pose).toBe('straight');
  expect(Math.abs(straight.jointAngles.rightHip)).toBeLessThan(0.15);
  expect(Math.abs(straight.jointAngles.rightKnee)).toBeLessThan(0.1);
  expect(Math.abs(straight.jointAngles.spine)).toBeLessThan(0.1);
  expect(straight.inertia).toBeGreaterThan(base.inertia*1.7);
  expect(tuck.jointAngles.rightKnee).toBeGreaterThan(2.5);
  expect(tuck.jointAngles.rightHip).toBeLessThan(base.jointAngles.rightHip);
  expect(tuck.jointAngles.spine).toBeLessThan(base.jointAngles.spine);
  expect(tuck.inertia).toBeLessThan(base.inertia*0.92);
  // Real keyboard mappings, including removal of A/D.
  await page.keyboard.down('w');
  await expect.poll(async()=>(await snapshot(page)).pose).toBe('straight');
  await page.keyboard.up('w');
  await page.keyboard.down('l');
  await expect.poll(async()=>(await snapshot(page)).pose).toBe('tuck');
  await page.keyboard.up('l');
  await expect.poll(async()=>(await snapshot(page)).pose).toBe('base');
  const keys=await fixture(page,'return Object.keys(scene.controller.keys);');
  expect(keys).toEqual(['straight','tuck','twist','release','restart','pause']);
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
  expect(result.catches).toEqual([0,1].map(bar=>({bar,count:2})));
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
    expect(s.worldBodies).toBe(14);
    expect(s.worldConstraints).toBe(18);
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

test('solid bars stop head, torso, hands and legs, including fast impacts', async ({page}) => {
  await start(page);
  const impacts = await fixture(page, `
    const results=[];
    try {
      for(const part of ['head','torso','leftLowerArm','rightLowerArm','leftShin','rightShin']){
        for(const axis of ['x','y'])for(const speed of [12,40]){
          scene.restart();scene.grabs.release();scene.grabs.releasedAt=Infinity;
          const body=scene.gymnast.bodies.find(b=>b.label==='nuro:'+part);
          // Isolate each actual Nuro collider to identify its contact unambiguously.
          for(const joint of scene.gymnast.joints)scene.matter.world.removeConstraint(joint);
          for(const stop of scene.gymnast.waistStops)scene.matter.world.removeConstraint(stop);
          for(const pair of scene.gymnast.pairedLimbs)scene.matter.world.removeConstraint(pair);
          for(const b of scene.gymnast.bodies)if(b!==body)scene.matter.world.remove(b);
          scene.gymnast.step=()=>{};
          const bar=scene.level.bars[0];
          Matter.Body.setAngle(body,0);
          Matter.Body.setAngularVelocity(body,0);
          Matter.Body.setPosition(body,{x:bar.x-(axis==='x'?90:0),y:bar.y-(axis==='y'?90:0)});
          Matter.Body.setVelocity(body,{x:axis==='x'?speed:0,y:axis==='y'?speed:0});
          let hit=false;
          const onHit=e=>{hit ||= e.pairs.some(p=>(p.bodyA===body&&p.bodyB===bar.body)||(p.bodyB===body&&p.bodyA===bar.body));};
          scene.matter.world.on('collisionstart',onHit);
          for(let t=0;t<30&&!hit;t++)scene.update(0,1000/120);
          scene.matter.world.off('collisionstart',onHit);
          results.push({part,axis,speed,hit,position:body.position[axis],edge:bar.body.bounds.max[axis],velocity:body.velocity[axis]});
        }
      }
    }finally{scene.restart();}
    return results;
  `);
  expect(impacts).toHaveLength(24);
  for(const impact of impacts){
    expect(impact.hit,JSON.stringify(impact)).toBe(true);
    expect(impact.position).toBeLessThan(impact.edge);
    expect(impact.velocity).toBeLessThan(impact.speed*0.5);
  }
});
