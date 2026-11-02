const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');

function fixture() {
  const order = {id: 1179, db_id: 1200, files: 2};
  const photos = [{id: 42, name: 'wrong.jpg', url: 'data:image/jpeg;base64,YQ==', persisted: true},
    {id: 99, name: 'keep.jpg', url: 'data:image/jpeg;base64,YQ==', persisted: true}];
  const c = {URL, atob, console, window: {mmsAuthProfile: {access_profile:'admin', is_active:true}},
    appData: {orders: [order]}, appState: {currentView: 'order-detail', selectedOrderId: 1179,
      orderAttachments: {1179: photos}, draftOrder: {note: 'Do not lose'}, loadedOrderAttachmentIds:{1179:true}},
    getSelectedOrder: () => order, navigate(){}, saveDraftOrder(){}, renderApp(){throw Error('Must not redraw the form');},
    setFlashMessage(){}, document:{querySelector:()=>null, querySelectorAll:()=>[], addEventListener(){}},
  };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync('app-order-enhancements.js','utf8'),c);
  vm.runInContext(fs.readFileSync('app-order-photo-trash.js','utf8'),c);
  let requests = [], reads = 0, confirmations = 0;
  c.confirmOrderPhotoRemoval = async () => {confirmations++; return true;};
  c.fetch = async (url, opts) => {requests.push({url, ...JSON.parse(opts.body)}); return {ok:true, text:async()=>JSON.stringify({attachment:{id:42,name:'wrong.jpg',deleted_at:'now'},active_count:1})};};
  c.loadPersistedOrderAttachments = async (dbId,force,key) => {assert.equal(dbId,1200); assert.equal(key,1179); reads++;};
  return {c, order, requests, reads:()=>reads, confirmations:()=>confirmations};
}

test('Delete controls only appear for authorized saved order photos; drafts keep Rimuovi',()=>{
  const f=fixture(), c=f.c;
  assert.match(c.renderAttachmentCards(c.getAttachmentList('order'),'order'), /Cancella/);
  assert.match(c.renderAttachmentCards([{name:'draft.jpg'}],'draft'), /Rimuovi/);
  assert.doesNotMatch(c.renderAttachmentCards([{name:'local.jpg',fromQuote:true}],'order'), /Cancella/);
  for(const role of ['operator',undefined]) {
    c.window.mmsAuthProfile={access_profile:role};
    assert.equal(c.renderOrderPhotoDeleteButton({id:42,persisted:true}),'');
  }
});

test('Confirmed removal targets exact database IDs, keeps other photos and unsaved fields', async()=>{
  const f=fixture();
  await f.c.changeOrderPhotoVisibility(42,'delete');
  assert.equal(f.requests.length,1);
  assert.deepEqual(f.requests[0],{url:'/api/update-attachment',order_id:1200,attachment_id:42,action:'delete'});
  assert.equal(f.c.appState.orderAttachments[1179].length,1);
  assert.equal(f.c.appState.orderAttachments[1179][0].id,99);
  assert.equal(f.c.appState.draftOrder.note,'Do not lose');
  assert.equal(f.order.files,1);
  assert.match(f.c.renderOrderPhotoTrash(),/Ripristina/);
  assert.equal(f.reads(),1);
});

test('Cancel and duplicate clicks do not submit extra mutations',async()=>{
  const f=fixture();
  f.c.confirmOrderPhotoRemoval=async()=>false;
  await f.c.changeOrderPhotoVisibility(42,'delete');
  assert.equal(f.requests.length,0);
  f.c.confirmOrderPhotoRemoval=async()=>true;
  await Promise.all([f.c.changeOrderPhotoVisibility(42,'delete'),f.c.changeOrderPhotoVisibility(42,'delete')]);
  assert.equal(f.requests.length,1);
});

test('403/lost responses preserve photos and fields; unlock controls for retry',async()=>{
  const f=fixture();
  f.c.fetch=async()=>({ok:false,status:403,text:async()=>'{"error":"Not authorized"}'});
  await f.c.changeOrderPhotoVisibility(42,'delete');
  assert.equal(f.c.appState.orderAttachments[1179].length,2);
  assert.equal(f.c.appState.draftOrder.note,'Do not lose');
  f.c.fetch=async()=>{throw Error('Connection lost');};
  await f.c.changeOrderPhotoVisibility(42,'delete');
  assert.equal(f.c.appState.orderAttachments[1179].length,2);
});

test('Restore sends deletion version; removed quote previews stay hidden, originals unchanged',async()=>{
  const f=fixture(), c=f.c;
  const sourcePhoto={name:'wrong.png', dataUrl:'data:image/png;base64,YQ=='};
  const unchanged=JSON.stringify(sourcePhoto);
  c.rememberOrderPhotoTrash({deleted_attachments:[{id:42,name:'wrong.jpg',deleted_at:'now'}],hidden_photo_names:['wrong.jpg']},1179);
  assert.equal(c.isOrderPhotoHidden(sourcePhoto,1179),true);
  assert.equal(c.isOrderPhotoHidden({id:99,name:'wrong.jpg',persisted:true},1179),false);
  assert.equal(c.isOrderPhotoHidden(sourcePhoto,1180),false);
  assert.equal(JSON.stringify(sourcePhoto),unchanged);
  await c.changeOrderPhotoVisibility(42,'restore');
  assert.equal(f.requests[0].expected_deleted_at,'now');
  assert.equal(f.requests[0].action,'restore');
});

test('An in-flight old gallery read completes before mutation',async()=>{
  const f=fixture();
  let finish;
  f.c.pending=new Promise(resolve=>finish=resolve);
  vm.runInContext('attachmentLoadPromises.set(1179,pending)',f.c);
  const mutation=f.c.changeOrderPhotoVisibility(42,'delete');
  await new Promise(setImmediate);
  assert.equal(f.requests.length,0);
  finish();
  await mutation;
  assert.equal(f.requests.length,1);
});
