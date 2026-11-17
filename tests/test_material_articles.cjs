const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const order={id:1150,sourceQuotePayload:{articles:[{id:'shirt',name:'Camicia'},{code:'trousers',name:'Pantalone'}]}};
const draft={materials:[],tasks:[]},events={};let writes=0;
const c=vm.createContext({window:{},appState:{currentView:'order-detail'},appData:{orderMaterials:{1150:[]},inventory:[]},
 getSelectedOrder:()=>order,orderDetailEditCurrentDraft:()=>draft,orderDetailEditSave:()=>writes++,setFlashMessage(){},renderApp(){},
 document:{querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(name,fn)=>events[name]=fn},
 orderDetailEditHandleField(target){const row=draft.materials[Number(target.dataset.orderDetailMaterialIndex)];if(row)row[target.dataset.orderDetailMaterialField]=target.value;return true;}});
vm.runInContext(fs.readFileSync('app-order-material-articles.js','utf8'),c);
const api=c.window.mmsMaterialArticles;
assert.equal(api.articles(order)[0].key,'shirt');assert.equal(api.articles(order)[1].key,'trousers');
const item={id:1,available:10,reserved:6,unit:'m'},mat=(qty,key='shirt')=>({inventory_item_id:1,quantity_required:qty,article_key:key,source_type:'mms',product_name:'Tessuto'});
let results=api.availability([mat(3),mat(3,'trousers')],[],[item]);
assert.equal(results[0].covered,3);assert.equal(results[1].covered,1);assert.equal(results[1].missing,2);
const saved=[{...mat(2),id:5,reserved_quantity:2}];
results=api.availability([{...mat('3,5'),id:5}],saved,[{...item,reserved:8}]);
assert.equal(results[0].covered,3.5);assert.equal(results[0].missing,0);assert.equal(results[0].reserved,2);
assert.equal(api.availability([{source_type:'cliente',quantity_required:4}],[],[])[0].client,true);
assert.equal(api.availability([mat(4)],[],[])[0].unknown,true);
const before=JSON.stringify({saved,item});api.availability([mat(4)],saved,[item]);assert.equal(JSON.stringify({saved,item}),before);
draft.materials=[mat(2)];c.orderDetailEditHandleField({matches:()=>true,dataset:{orderDetailMaterialIndex:'0',orderDetailMaterialField:'article_key'},value:'trousers'});
assert.equal(draft.materials[0].article_name,'Pantalone');
assert.match(c.window.mmsMaterialArticleSelect(draft.materials[0],0),/value="trousers" selected/);
order.sourceQuotePayload.articles[0].name='<script>alert(1)</script>';
assert.doesNotMatch(c.window.mmsMaterialArticleSelect(draft.materials[0],0),/<script>/);
(async()=>{
 draft.materials=[mat(0)];await assert.rejects(c.orderDetailEditSave());assert.equal(writes,0);
 draft.materials=[mat(2,'foreign')];await assert.rejects(c.orderDetailEditSave());assert.equal(writes,0);
 draft.materials=[mat(2)];c.orderDetailEditSave();assert.equal(writes,1);
 await saveRoundTrip();
 console.log('Article links, captured fields, total shared stock allocation, own reservations, client/unknown stock, immutable preview, escaping and pre-save validation passed.');
})().catch(e=>{console.error(e);process.exit(1);});

async function saveRoundTrip() {
 const persisted={id:9,product_name:'Tessuto',inventory_item_id:1,quantity_required:2,article_key:'shirt',article_name:'Camicia',source_type:'mms'};
 const draft={materials:[{...persisted,article_key:'trousers',article_name:'Pantalone'}]};
 const order={id:1150,db_id:1172};let release,request,loads=0,stockRefreshes=0;
 const gate=new Promise(resolve=>release=resolve);
 const context=vm.createContext({window:{addEventListener(){},mmsMaterialsRefreshStock:async()=>stockRefreshes++},
  document:{getElementById:()=>null,querySelector:()=>null},appState:{currentView:'test'},appData:{orderMaterials:{1150:[persisted]},inventory:[]},
  getSelectedOrder:()=>order,orderDetailEditDraftFor:()=>draft,orderDetailEditSave:()=>Promise.resolve('base saved'),orderDetailEditMaterialToDraft:row=>row,
  renderApp(){},setFlashMessage(){},console,
  orderFlowLoadMaterials:async()=>{loads++;context.appData.orderMaterials[1150]=request.materials;},
  fetch:async(url,options)=>{assert.equal(url,'/api/save-materials');request=JSON.parse(options.body);await gate;return {ok:true,json:async()=>({saved:1})};},
 });
 vm.runInContext(fs.readFileSync('app-order-inventory-link-fix.js','utf8').replace('loaded: false','loaded: true'),context);
 let finished=false;const saving=context.orderDetailEditSave().then(()=>finished=true);
 await new Promise(setImmediate);
 assert.equal(request.materials[0].article_key,'trousers','Changing only the article still sends the material save');
 assert.equal(request.order_db_id,1172);assert.equal(finished,false,'Save must await database confirmation');
 release();await saving;assert.equal(loads,1);assert.equal(stockRefreshes,1);
 const reloaded=context.orderDetailEditMaterialToDraft(context.appData.orderMaterials[1150][0]);
 assert.equal(reloaded.article_key,'trousers');assert.equal(reloaded.article_name,'Pantalone');
 assert.equal(reloaded.quantity_required,2);
}
