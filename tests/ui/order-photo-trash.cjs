// Isolated real-browser UI test. API requests are mocked; no production writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const {chromium} = require('playwright');
const scripts = ['app-order-enhancements.js', 'app-order-photo-trash.js'];
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQ1sAAAAASUVORK5CYII=';

(async()=>{
  const server = http.createServer((req,res)=>{
    const path = req.url.slice(1);
    res.setHeader('Content-Type',scripts.includes(path)?'application/javascript':'text/html');
    res.end(scripts.includes(path)?fs.readFileSync(path):'<!doctype html><html><body><input id="unsaved" value="Nota non salvata"><main id="fixture"></main></body></html>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser = await chromium.launch({headless:true});
    const page = await browser.newPage();
    const rows = [{id:42,name:'Foto sbagliata.png',url:pixel,persisted:true}, {id:99,name:'Foto corretta.png',url:pixel,persisted:true}];
    let writes = 0;
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/**',async route=>{
      if(route.request().url().includes('/api/update-attachment')){
        const payload=route.request().postDataJSON();
        assert.equal(payload.order_id,1200);
        const photo=rows.find(p=>p.id===payload.attachment_id);
        photo.deleted_at=payload.action==='delete'?'2026-11-02T11:00:00+00:00':null;
        writes++;
        return route.fulfill({json:{attachment:photo,active_count:rows.filter(p=>!p.deleted_at).length}});
      }
      const deleted=rows.filter(p=>p.deleted_at);
      return route.fulfill({json:{attachments:rows.filter(p=>!p.deleted_at),deleted_attachments:deleted,hidden_photo_names:deleted.map(p=>p.name)}});
    });
    async function open(){
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.evaluate(()=>{
        window.mmsAuthProfile={access_profile:'admin',is_active:true};
        window.appState={currentView:'order-detail',selectedOrderId:1179};
        window.appData={orders:[{id:1179,db_id:1200,files:2}]};
        window.getSelectedOrder=()=>appData.orders[0];
        window.navigate=window.saveDraftOrder=window.renderApp=()=>{};
        window.setFlashMessage=()=>{};
      });
      for(const path of scripts) await page.addScriptTag({url:`/${path}`});
      await page.evaluate(async()=>{
        document.getElementById('fixture').innerHTML=renderOrderDetailAttachments();
        attachOrderEnhancementEvents();
        await loadPersistedOrderAttachments(1200,true,1179);
      });
    }
    await open();
    assert.equal(await page.locator('[data-order-photo-delete]').count(),2);
    await page.locator('[data-order-photo-delete="42"]').click();
    await page.locator('dialog[open]').waitFor();
    assert.match(await page.locator('dialog').textContent(),/Foto sbagliata.png/);
    assert.equal(await page.locator('dialog img').getAttribute('alt'),'Foto sbagliata.png');
    await page.getByRole('button',{name:'Annulla',exact:true}).click();
    assert.equal(writes,0);
    await page.locator('[data-order-photo-delete="42"]').click();
    await page.getByRole('button',{name:'Cancella foto',exact:true}).click();
    await page.locator('[data-order-attachment-message]').filter({hasText:'Foto eliminata.'}).waitFor();
    assert.equal(await page.locator('[data-order-photo-delete]').count(),1);
    assert.equal(await page.locator('#unsaved').inputValue(),'Nota non salvata');
    await open(); // Simulates reopening on a fresh page, without a local undo token.
    assert.equal(await page.locator('[data-order-photo-delete]').count(),1);
    await page.locator('.order-photo-trash summary').click();
    await page.getByRole('button',{name:'Ripristina',exact:true}).click();
    await page.locator('[data-order-attachment-message]').filter({hasText:'Foto ripristinata.'}).waitFor();
    assert.equal(await page.locator('[data-order-photo-delete]').count(),2);
    assert.equal(await page.locator('.order-photo-trash').count(),0);
    assert.equal(writes,2);
    assert.deepEqual(errors,[]);
    console.log('Browser: preview confirmation, cancel, delete, reopen, restore, independent photos, preserved input: passed. Mocked API, no production photos changed.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
