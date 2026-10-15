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
  const extra=document.getElementById('cad-more-actions');
  if(extra){
    extra.addEventListener('click',event=>{
      if(event.target.closest('.tool-grid button'))extra.open=false;
    });
    extra.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&extra.open){extra.open=false;extra.querySelector('summary')?.focus();}
    });
    document.addEventListener('pointerdown',event=>{
      if(extra.open&&!extra.contains(event.target))extra.open=false;
    });
  }
  const agendaExtra=document.getElementById('agenda-more-actions');
  if(agendaExtra){
    agendaExtra.addEventListener('click',event=>{
      if(event.target.closest('.agenda-more-panel button'))agendaExtra.open=false;
    });
    agendaExtra.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&agendaExtra.open){
        agendaExtra.open=false;
        agendaExtra.querySelector('summary')?.focus();
      }
    });
    document.addEventListener('pointerdown',event=>{
      if(agendaExtra.open&&!agendaExtra.contains(event.target))agendaExtra.open=false;
    });
  }
})();
