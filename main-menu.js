/* Direct navigation for the existing V2 sections. Permissions remain in enter()/tab(). */
(()=>{
  'use strict';
  const primary=document.getElementById('main-primary-nav');
  const shell=document.getElementById('main-nav-shell');
  const settings=document.getElementById('tset');
  if(!primary||!shell||!settings)return;
  const areas=[...primary.querySelectorAll('button'),settings];
  function syncCurrent(){
    for(const button of areas){
      if(button.classList.contains('active')&&!button.classList.contains('hidden'))
        button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    }
  }
  // Observe existing role visibility and tab changes, without adding another navigation layer.
  new MutationObserver(syncCurrent).observe(shell,{subtree:true,attributes:true,attributeFilter:['class']});
  syncCurrent();
})();
