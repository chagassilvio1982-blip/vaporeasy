/* Reuse navigation buttons and handlers; never change role permissions. */
(()=>{
  const dialog=document.getElementById('main-menu-dialog');
  const toggle=document.getElementById('main-menu-toggle');
  const current=document.getElementById('main-menu-current');
  const nav=dialog.querySelector('nav');
  function updateCurrent(){
    const active=nav.querySelector('button.active:not(.hidden)');
    if(active)current.textContent=active.textContent;
    nav.querySelectorAll('button').forEach(button=>{
      if(button===active)button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    });
  }
  toggle.addEventListener('click',()=>{
    updateCurrent();
    dialog.showModal();
    toggle.setAttribute('aria-expanded','true');
  });
  document.getElementById('main-menu-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>toggle.setAttribute('aria-expanded','false'));
  dialog.addEventListener('click',event=>{
    if(event.target!==dialog)return;
    const box=dialog.getBoundingClientRect();
    if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();
  });
  nav.addEventListener('click',event=>{
    if(event.target.closest('button')){updateCurrent();dialog.close();}
  });
  new MutationObserver(updateCurrent).observe(nav,{subtree:true,attributes:true,attributeFilter:['class']});
  updateCurrent();
})();
