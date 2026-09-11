/* Only the offline mini-tool entry loads this setup. No network or native APIs. */
(function () {
  window.MiniToolRuntime = {
    level: 0, count: 192, buffer: 960, heroSeeds: window.MiniToolHeroSeeds || [],
    renderOptions: function () {
      return {size: this.level ? 768 : 1024, maxTriangles: this.level ? 49999 : 99999,
        samples: this.level ? 24 : 40, secondary: this.level ? 24 : 64, airflow: this.level ? 4 : 7};
    }
  };
  function updateHeight() {
    document.documentElement.style.setProperty('--app-height', window.innerHeight + 'px');
  }
  window.addEventListener('resize', updateHeight);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', updateHeight);
  updateHeight();
})();
