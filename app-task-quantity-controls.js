(function () {
  if(typeof orderDetailEditSave==='function') {
    const base=orderDetailEditSave;
    orderDetailEditSave=function saveTaskQuantity() {
      try { taskQuantityValidateDraft(orderDetailEditCurrentDraft()); }
      catch(error) { if(typeof setFlashMessage==='function')setFlashMessage(error.message);return Promise.reject(error); }
      return base();
    };
  }
})();
