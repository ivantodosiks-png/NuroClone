export const icon = (name: 'pause' | 'play' | 'restart' | 'expand' | 'arrow' | 'close') => {
  const paths = {
    pause: '<path d="M8 5v14M16 5v14"/>',
    play: '<path d="m9 5 11 7-11 7Z"/>',
    restart: '<path d="M4 11a8 8 0 1 1 2 6M4 4v7h7"/>',
    expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
};

export const brand = `<span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><span>nuro<span class="brand-light">clone</span><sup>®</sup></span>`;
