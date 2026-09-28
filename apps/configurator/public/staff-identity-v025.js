const ROLE_LABELS={
  viewer:'View',
  sales:'Sales',
  workshop:'Workshop',
  qc:'Final QC',
  admin:'Admin',
};

export function createStaffIdentityV025({el,state}){
  const ensureStyle=()=>{
    if(document.querySelector('link[data-staff-identity-v025]'))return;
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='/staff-identity-v025.css';
    link.dataset.staffIdentityV025='1';
    document.head.append(link);
  };

  const ensureUi=()=>{
    let root=el('staffIdentity');
    if(!root){
      root=document.createElement('div');
      root.id='staffIdentity';
      root.className='staff-identity-v025';
      root.innerHTML='<span class="staff-identity-v025__mark" aria-hidden="true">ID</span><span class="staff-identity-v025__copy"><strong data-staff-name>Staff</strong><small data-staff-roles></small></span>';
      const refresh=el('refresh');
      refresh?.parentNode?.insertBefore(root,refresh);
    }
    let legacy=el('staffIdentityLegacy');
    if(!legacy){
      legacy=document.createElement('p');
      legacy.id='staffIdentityLegacy';
      legacy.hidden=true;
      legacy.textContent='Legacy shared access cannot provide individual audit identity. Use named staff access keys for production work.';
      const scan=document.querySelector('.scan-bar');
      scan?.parentNode?.insertBefore(legacy,scan);
    }
    return root;
  };

  const can=(...roles)=>{
    const identity=state.identity;
    if(!identity)return false;
    if(identity.roles?.includes('admin'))return true;
    return roles.some((role)=>identity.roles?.includes(role));
  };

  const authenticatedActor=()=>{
    const identity=state.identity;
    return identity&&!identity.legacy?identity.name||'':'';
  };

  const actorField=(id,...roles)=>{
    const node=el(id);
    if(!node)return;
    const actor=authenticatedActor();
    const permitted=can(...roles);
    if(actor){
      node.value=actor;
      node.readOnly=true;
      node.dataset.authenticatedActor='1';
      node.title='Bound to authenticated staff identity';
    }else{
      node.readOnly=false;
      delete node.dataset.authenticatedActor;
      node.removeAttribute('title');
    }
    if(!permitted)node.disabled=true;
  };

  const restrict=(id,...roles)=>{
    const node=el(id);
    if(node&&!can(...roles))node.disabled=true;
  };

  const apply=()=>{
    ensureStyle();
    const identity=state.identity;
    const root=ensureUi();
    if(root){
      if(!identity){
        root.hidden=true;
      }else{
        root.hidden=false;
        const name=root.querySelector('[data-staff-name]');
        const roles=root.querySelector('[data-staff-roles]');
        if(name)name.textContent=identity.name||identity.id||'Staff';
        if(roles)roles.textContent=(identity.roles||[]).map((role)=>ROLE_LABELS[role]||role).join(' · ');
        root.classList.toggle('is-legacy',Boolean(identity.legacy));
      }
    }

    restrict('saveOrder','sales');
    if(!can('sales')){
      for(const id of ['editStatus','quoteTotal','staffNotes','createDraft','sendInvoice','reconcileShopify']){
        const node=el(id);
        if(node)node.disabled=true;
      }
    }

    if(!can('workshop')){
      for(const node of document.querySelectorAll('.workshop-fields input,.workshop-fields textarea')){
        node.disabled=true;
      }
      for(const id of ['saveWorkshop','releaseWorkshop','createRevision','revisionReason']){
        const node=el(id);
        if(node)node.disabled=true;
      }
    }

    if(!can('workshop','qc')){
      for(const node of document.querySelectorAll('#manufacturingChecks input,#qualityChecks input')){
        node.disabled=true;
      }
      restrict('saveQcProgress','workshop','qc');
      restrict('uploadQcPhoto','workshop','qc');
      const photo=el('qcPhoto');
      if(photo)photo.disabled=true;
    }

    restrict('completeWorkshop','qc');

    actorField('wsReleasedBy','workshop');
    actorField('revisionBy','workshop');
    actorField('qcActor','workshop','qc');

    const legacyNote=el('staffIdentityLegacy');
    if(legacyNote)legacyNote.hidden=!identity?.legacy;
  };

  return {apply,can,authenticatedActor};
}
