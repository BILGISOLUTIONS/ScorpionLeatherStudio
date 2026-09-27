const ACTOR_KEY='scorpion-workshop-actor';
const AUTOSAVE_KEY='scorpion-workshop-autosave';

const requiredCheckboxes=(root)=>[...root.querySelectorAll('input[data-check-id]')];

export function createWorkshopFocusV024({el,state}){
  let root=null;
  let active=false;
  let saveTimer=0;
  let observer=null;

  const focusable=(node)=>node&&typeof node.scrollIntoView==='function'&&node;

  const counts=()=>{
    const manufacturing=requiredCheckboxes(el('manufacturingChecks'));
    const quality=requiredCheckboxes(el('qualityChecks'));
    return {
      manufacturingDone:manufacturing.filter((input)=>input.checked).length,
      manufacturingTotal:manufacturing.length,
      qualityDone:quality.filter((input)=>input.checked).length,
      qualityTotal:quality.length,
    };
  };

  const nextRequired=()=>{
    const firstManufacturing=requiredCheckboxes(el('manufacturingChecks')).find((input)=>!input.checked);
    if(firstManufacturing)return firstManufacturing.closest('label')?.querySelector('span')?.textContent||'Continue manufacturing checklist';
    const firstQuality=requiredCheckboxes(el('qualityChecks')).find((input)=>!input.checked);
    if(firstQuality)return firstQuality.closest('label')?.querySelector('span')?.textContent||'Continue final QC checklist';
    if(!el('qcPhotoSource').href||el('qcPhotoSource').hidden)return 'Store final QC photo';
    return 'Complete final QC';
  };

  const setProgress=(bar,value,total)=>{
    const percent=total>0?Math.round((value/total)*100):0;
    bar.style.setProperty('--progress',percent+'%');
    bar.setAttribute('aria-valuenow',String(percent));
    bar.querySelector('strong').textContent=value+'/'+total;
  };

  const refresh=()=>{
    if(!root)return;
    const packet=state.workshopPacket;
    const selected=state.selected;
    if(!packet||!selected)return;

    root.querySelector('[data-focus-work-order]').textContent=packet.workOrderId||selected.request_id||'—';
    root.querySelector('[data-focus-revision]').textContent=packet.revisionId||selected.workshop_revision_id||'—';
    root.querySelector('[data-focus-product]').textContent=(packet.product?.referenceTitle||selected.reference_title||'Build')+' · Qty '+String(packet.product?.quantity||selected.quantity||1);
    root.querySelector('[data-focus-next]').textContent=nextRequired();

    const progress=counts();
    setProgress(root.querySelector('[data-focus-manufacturing]'),progress.manufacturingDone,progress.manufacturingTotal);
    setProgress(root.querySelector('[data-focus-quality]'),progress.qualityDone,progress.qualityTotal);

    const completed=Boolean(state.workshopOps&&state.workshopOps.qcCompletedAt);
    root.classList.toggle('is-complete',completed);
    root.querySelector('[data-focus-state]').textContent=completed?'Completed':'Active production';
  };

  const autosaveEnabled=()=>root?.querySelector('[data-focus-autosave]')?.checked===true;

  const scheduleSave=()=>{
    refresh();
    if(!active||!autosaveEnabled())return;
    window.clearTimeout(saveTimer);
    saveTimer=window.setTimeout(()=>{
      const actor=el('qcActor').value.trim();
      const save=el('saveQcProgress');
      if(!actor){
        root.querySelector('[data-focus-note]').textContent='Enter the workshop operator before auto-save can run.';
        return;
      }
      if(save.disabled){
        root.querySelector('[data-focus-note]').textContent='Progress is currently locked or already complete.';
        return;
      }
      root.querySelector('[data-focus-note]').textContent='Auto-saving checklist progress…';
      save.click();
      window.setTimeout(()=>{
        if(root&&active)root.querySelector('[data-focus-note]').textContent='Checklist changes are saved through the existing workshop gate.';
      },700);
    },650);
  };

  const makeProgress=(label,attr)=>{
    const wrap=document.createElement('div');
    wrap.className='workshop-focus-progress';
    wrap.setAttribute(attr,'');
    wrap.setAttribute('role','progressbar');
    wrap.setAttribute('aria-valuemin','0');
    wrap.setAttribute('aria-valuemax','100');
    wrap.innerHTML='<span>'+label+'</span><strong>0/0</strong><i aria-hidden="true"></i>';
    return wrap;
  };

  const ensureStyle=()=>{
    if(document.querySelector('link[data-workshop-focus-v024]'))return;
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='/staff-focus-v024.css';
    link.dataset.workshopFocusV024='1';
    document.head.append(link);
  };

  const ensureUi=()=>{
    if(root)return root;
    ensureStyle();
    root=document.createElement('section');
    root.className='workshop-focus-bar';
    root.setAttribute('aria-label','Workshop focus station');
    root.innerHTML=
      '<div class="workshop-focus-identity">'+
        '<span data-focus-state>Active production</span>'+
        '<strong data-focus-work-order>—</strong>'+
        '<code data-focus-revision>—</code>'+
        '<small data-focus-product>—</small>'+
      '</div>'+
      '<div class="workshop-focus-next"><span>NEXT REQUIRED</span><strong data-focus-next>—</strong><small data-focus-note>Focus mode keeps only shop-floor controls in view.</small></div>'+
      '<div class="workshop-focus-actions">'+
        '<label class="workshop-focus-autosave"><input type="checkbox" data-focus-autosave> Auto-save checklist</label>'+
        '<button type="button" class="secondary" data-focus-packet>Packet</button>'+
        '<button type="button" class="secondary" data-focus-qc>Progress / QC</button>'+
        '<button type="button" class="secondary" data-focus-exit>Exit focus</button>'+
      '</div>';
    const progress=document.createElement('div');
    progress.className='workshop-focus-progress-grid';
    progress.append(
      makeProgress('Manufacturing','data-focus-manufacturing'),
      makeProgress('Final QC','data-focus-quality'),
    );
    root.querySelector('.workshop-focus-next').after(progress);
    el('detail').querySelector('.detail-head').after(root);

    const savedActor=sessionStorage.getItem(ACTOR_KEY)||'';
    if(savedActor&&!el('qcActor').value)el('qcActor').value=savedActor;
    const autosave=sessionStorage.getItem(AUTOSAVE_KEY)==='1';
    root.querySelector('[data-focus-autosave]').checked=autosave;

    root.querySelector('[data-focus-packet]').addEventListener('click',()=>focusable(el('workshopState').closest('.workshop-card'))?.scrollIntoView({behavior:'smooth',block:'start'}));
    root.querySelector('[data-focus-qc]').addEventListener('click',()=>focusable(el('qcState').closest('.workshop-qc-card'))?.scrollIntoView({behavior:'smooth',block:'start'}));
    root.querySelector('[data-focus-exit]').addEventListener('click',deactivate);
    root.querySelector('[data-focus-autosave]').addEventListener('change',(event)=>{
      sessionStorage.setItem(AUTOSAVE_KEY,event.currentTarget.checked?'1':'0');
      root.querySelector('[data-focus-note]').textContent=event.currentTarget.checked
        ? 'Auto-save batches checklist changes after a short delay.'
        : 'Auto-save is off. Use Save progress or Ctrl/Cmd+S.';
    });
    el('qcActor').addEventListener('input',()=>{
      const actor=el('qcActor').value.trim();
      if(actor)sessionStorage.setItem(ACTOR_KEY,actor);
    });
    el('manufacturingChecks').addEventListener('change',scheduleSave);
    el('qualityChecks').addEventListener('change',scheduleSave);

    observer=new MutationObserver(()=>refresh());
    observer.observe(el('manufacturingChecks'),{childList:true,subtree:true,attributes:true,attributeFilter:['checked']});
    observer.observe(el('qualityChecks'),{childList:true,subtree:true,attributes:true,attributeFilter:['checked']});
    observer.observe(el('qcState'),{childList:true,subtree:true,characterData:true});
    return root;
  };

  const activate=()=>{
    const packet=state.workshopPacket;
    if(!state.selected||!packet||packet.release?.state!=='released-for-production'){
      el('workshopState').textContent='Workshop focus becomes available after the exact build revision is released for production.';
      return false;
    }
    ensureUi();
    active=true;
    el('detail').classList.add('workshop-focus-mode');
    root.hidden=false;
    refresh();
    root.querySelector('[data-focus-note]').textContent=autosaveEnabled()
      ? 'Auto-save is on. Checklist changes are batched before saving.'
      : 'Auto-save is off. Use Save progress or Ctrl/Cmd+S.';
    el('qcActor').focus({preventScroll:true});
    return true;
  };

  function deactivate(){
    active=false;
    window.clearTimeout(saveTimer);
    el('detail').classList.remove('workshop-focus-mode');
    if(root)root.hidden=true;
  }

  const keydown=(event)=>{
    if(!active)return;
    if(event.key==='Escape'){
      event.preventDefault();
      event.stopPropagation();
      deactivate();
      return;
    }
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){
      event.preventDefault();
      const save=el('saveQcProgress');
      if(!save.disabled)save.click();
    }
  };
  document.addEventListener('keydown',keydown,true);

  return {
    activate,
    deactivate,
    refresh,
    destroy(){
      deactivate();
      document.removeEventListener('keydown',keydown,true);
      if(observer)observer.disconnect();
      if(root)root.remove();
      root=null;
    },
  };
}
