var listAccount=[];
var currentCookie="";
var currentUid = "";
var currentUrl="";
async function getCurrentTab() {
  let queryOptions = { active: true, currentWindow: true };
  let [tab] = await chrome.tabs.query(queryOptions);
  return tab;
}
async  function loadCurrentCookie() { 
	let tab = await getCurrentTab(); 
		currentUrl=tab.url;
		if(currentUrl.indexOf('chrome://newtab')>-1){
			currentUrl="https://www.facebook.com";
		}
		$('#GetUidFromUrl').attr('placeholder',currentUrl);
		$('#CurrentCookieUrl').html(extractHostname(currentUrl));
        chrome.cookies.getAll({ "url": currentUrl }, function (cookie) {
            var result = "";
            for (var i = 0; i < cookie.length; i++) {
                result += cookie[i].name + "=" + cookie[i].value + "; ";
                if (cookie[i].name == "c_user") {
                    currentUid = cookie[i].value;
                }
            }
			result += "useragent=" +btoa(navigator.userAgent).replace('=','%3D').replace('=','%3D').replace('=','%3D')+ "; ";
            result += "_uafec=" +encodeURIComponent(navigator.userAgent)+ "; ";
            
			document.getElementById('cookieresult').value = result;
            currentCookie = result;
            updateActiveHighlight();
			if(currentUrl.indexOf('telegram')>-1 ||currentUrl.indexOf('zalo')>-1) {
					 chrome.scripting.executeScript(
						  {
							  target: {tabId: tab.id}, 
							  function: () => {
									  var objRs = {}; 
									  try{var globalStateObj=JSON.parse(localStorage["tt-global-state"]); objRs["global_state"]={"authPhoneNumber":globalStateObj["authPhoneNumber"],"currentUserId":globalStateObj["currentUserId"]};} catch(ex){try{var user_auth=JSON.parse(localStorage["user_auth"]); objRs["global_state"]={"currentUserId":user_auth["id"]};} catch(ex2){}} for (var a in localStorage) { if(a!="tt-global-state" && a!="global_state"){objRs[a]=localStorage[a];}} objRs["GramJs:apiCache"]=""; 
									   
									  return objRs;
							  } 
						   },function (rs) { 
								 var objRs=rs[0].result;
								if(objRs!=undefined && objRs!=null && objRs!=''){ 
								    
									if(objRs.hasOwnProperty("z_uuid"))
									{
										currentCookie+= "z_uuid="+objRs["z_uuid"]+"; ";
									}
									if(currentUrl.indexOf('telegram')>-1) {
										currentCookie+= "tlp_ls="+encodeURIComponent(JSON.stringify(objRs))+"; ";
									}
									document.getElementById('cookieresult').value = currentCookie; 
									
								}
						   });
			}
			if(currentUrl.indexOf('facebook')>-1 && 
			document.getElementById('auto_save_fbaccount').checked && 
			currentCookie.indexOf('xs=')>-1 && 
			currentCookie.indexOf('c_user=')>-1){
				document.getElementById('btncookiesave').click();
			}
        });
		
}

async function getUidFromLink() {
		var linktoget=$('#GetUidFromUrl').val().replace('www.face','mbasic.face').replace('m.face','mbasic.face');
		let tab = await getCurrentTab();
			var currentUrl=tab.url;
			if(linktoget==""||linktoget==null||linktoget==undefined)
			{
				linktoget=currentUrl.replace('www.face','mbasic.face').replace('m.face','mbasic.face');
			}
			var myTabId=tab.id;
			chrome.tabs.update(myTabId,{url :linktoget});
			var isFirst=true;
			var onUpd=function (updatedTabId , info) {
				  if (updatedTabId===myTabId && info.status === 'complete' && isFirst) {
					  isFirst=false;
					  chrome.tabs.onUpdated.removeListener(onUpd);
					  chrome.scripting.executeScript(
					  {
						  target: {tabId: myTabId},
						  function: () => {
								  var fid= "";
								  if(fid==""){try{var arr= document.getElementById("root").getElementsByTagName("a"); for(var i=0; i<arr.length;i++){ var href = arr[i].getAttribute("href")+" ";if(href.indexOf("mbasic/more/?owner_id=")>-1){ fid= /owner_id=(\d+)/.exec(href)[1]; break;}}}catch(ex){}}
								  if(fid==""){try{var arr= document.getElementById("root").getElementsByTagName("form"); for(var i=0; i<arr.length;i++){ var href = arr[i].getAttribute("action")+" ";if(href.indexOf("/a/group/join/?group_id=")>-1){ fid= href.split("=")[1].split("&")[0];break; }}}catch(ex){}}
								  if(fid==""){try{fid= document.getElementsByName("target")[0].value;}catch(ex){}}
								  if(fid!=""){try{window.prompt("ID do Facebook:", fid); window.history.back();}catch(ex){}}
								  return fid;
						  },
					   });
				  }
			};
			chrome.tabs.onUpdated.addListener(onUpd);
}  
async function getToken() {
		let tab = await getCurrentTab();
			var currentUrl=tab.url;
			var myTabId=tab.id;
			chrome.tabs.update(myTabId,{url :"https://business.facebook.com/business_locations/"});
			var isFirst=true;
			var onUpd=function (updatedTabId , info) {
				if (updatedTabId===myTabId && info.status === 'complete' && isFirst) {
					isFirst=false;
					chrome.tabs.onUpdated.removeListener(onUpd);
					chrome.scripting.executeScript(
					{
					  target: {tabId: myTabId},
					  function: () => {
								var fid= "";
								if(window.location.href.indexOf('security/twofactor/reauth')>-1){
									alert('Digite o código de verificação em duas etapas (2FA)');
									return fid;
								}
							    if(fid==""){try{fid= /"(EAA.*?)"/.exec(document.documentElement.outerHTML)[1];}catch(ex){}}
								try{
									window.prompt("Token do Business:", fid);
									window.history.back();
								}catch(ex){}
								return fid;
					  },
					});
				}
			};
			chrome.tabs.onUpdated.addListener(onUpd);
}  
function extractHostname(url) {
		var hostname;
		//find & remove protocol (http, ftp, etc.) and get hostname

		if (url.indexOf("://") > -1) {
			hostname = url.split('/')[2];
		}
		else {
			hostname = url.split('/')[0];
		}
		//find & remove port number
		hostname = hostname.split(':')[0];
		//find & remove "?"
		hostname = hostname.split('?')[0];

		return hostname;
}
function extractRootDomain(url) {
		var domain = extractHostname(url),
			splitArr = domain.split('.'),
			arrLen = splitArr.length;

		//extracting the root domain here
		//if there is a subdomain 
		if (arrLen > 2) {
			domain = splitArr[arrLen - 2] + '.' + splitArr[arrLen - 1];
			//check to see if it's using a Country Code Top Level Domain (ccTLD) (i.e. ".me.uk")
			if (splitArr[arrLen - 2].length == 2 && splitArr[arrLen - 1].length == 2) {
				//this is using a ccTLD
				domain = splitArr[arrLen - 3] + '.' + domain;
			}
		}
		return domain;
}
loadCurrentCookie();
var _reloadTimer = null;
var _lastLoadedUrl = "";
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (changeInfo.status == 'complete') {
		getCurrentTab().then(tab2=>{
            if (tab2.id == tabId && tab2.url !== _lastLoadedUrl) {
                _lastLoadedUrl = tab2.url;
                clearTimeout(_reloadTimer);
                _reloadTimer = setTimeout(loadCurrentCookie, 200);
			}
        });
    }
})
document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('cookieresult').onclick = function(){
		document.getElementById('cookieresult').select();
	};
	document.getElementById('CurrentFacebookId').onclick = function(){
		document.getElementById('CurrentFacebookId').select();
	};
	document.getElementById('btncookieimport').onclick = function(){
		var cookie = document.getElementById('cookieresult').value;
		if(cookie==''){
			getCurrentTab().then(tab2=>{
            if (tab2.id == tabId) {
				chrome.scripting.executeScript({target: {tabId: tab2.id}, 
					  function: () => {
							alert("Por favor, insira o cookie para importar!");
					  },
					})
				}
			}); 
			return;
		}
		importCookie(cookie);
		
	};
	if((localStorage.getItem("autosavefbacc")+"" =="0")){
		document.getElementById('auto_save_fbaccount').checked= false;
	}else{
		document.getElementById('auto_save_fbaccount').checked= true;
	}
	
	if (localStorage.getItem("listaccount") === null) {
        //...
    } else {
        listAccount = JSON.parse(localStorage.listaccount);
    }
	renderAccountList();
	$('#btncookiesave').click(function(){
		var cookieList= document.getElementById('cookieresult').value.split('\n');
		if(cookieList.length>1){
			for (var i = 0; i < cookieList.length; i++) {
				var cookie=cookieList[i];
				var arr = cookie.split("|");
				if(arr.length>1){
					 for (var k = 0; k < arr.length; k++) {
						try {
							if(arr[k].indexOf('c_user')>-1){
							cookie=arr[k];
							}
						} catch (ex) {
						   
						}
					}
				}
				const regex = /c_user=(\d+)/g;
				var m;
				var uid = '';
				while ((m = regex.exec(cookie)) !== null) {
					uid=m[1]
				}
				if(uid!=''){
					var acc={
						uid:uid,
						name:uid,
						cookie:cookie,
						token:'',
						note:'',
						pages:0,
						tries:0,
						bm:false
					};
					var isExist = false;
					for (var j = 0; j < listAccount.length; j++) {
						  if (listAccount[j].uid == acc.uid) {
							  acc.note = listAccount[j].note || '';
							  acc.token = listAccount[j].token || acc.token;
							  acc.pages = (listAccount[j].pages !== undefined ? listAccount[j].pages : (acc.pages || 0));
							  acc.tries = (listAccount[j].tries !== undefined ? listAccount[j].tries : (acc.tries || 0));
							  acc.bm = (listAccount[j].bm !== undefined ? listAccount[j].bm : (acc.bm || false));
							  listAccount[j] = acc;
							  isExist = true;
						  }
					}
					if (!isExist) {
						listAccount.push(acc);
						addNewAccItem(acc);
						$('#acc_' + acc.uid + ' .acc-note').focus();
					}
				}
			}
			localStorage.listaccount = JSON.stringify(listAccount);
		}else{
			getCurrentTab().then(tab2=>{
				chrome.scripting.executeScript(
						  {
							  target: {tabId: tab2.id}, 
							  function: () => {
									  var name= "";
									  try{name=document.querySelectorAll('div[role="navigation"]')[2].getElementsByTagName("a")[0].innerText}catch(ex){}
										if(name==undefined || name==""){const regex = /"NAME":"(.*?)"/g;const str = document.documentElement.innerHTML;var m=regex.exec(str); 
										name=m[1];
									  }
									  return encodeURIComponent(name);
							  }
						   },function (rs) { 
						var name = rs[0].result;
					if(name==null || name==''){
						name=currentUid+'';
					}else{
						 name = decodeURIComponent(name);
					}
					var acc={
						uid:currentUid,
						name:name+'',
						cookie:currentCookie,
						token:'',
						note:'',
						pages:0,
						tries:0,
						bm:false
					};
					var isExist = false;
					for (var j = 0; j < listAccount.length; j++) {
						  if (listAccount[j].uid == acc.uid) {
							  acc.note = listAccount[j].note || '';
							  acc.token = listAccount[j].token || acc.token;
							  acc.pages = (listAccount[j].pages !== undefined ? listAccount[j].pages : (acc.pages || 0));
							  acc.tries = (listAccount[j].tries !== undefined ? listAccount[j].tries : (acc.tries || 0));
							  acc.bm = (listAccount[j].bm !== undefined ? listAccount[j].bm : (acc.bm || false));
							  listAccount[j] = acc;
							  isExist = true;
						  }
					}
					if (!isExist) {
						listAccount.push(acc);
						addNewAccItem(acc);
						$('#acc_' + acc.uid + ' .acc-note').focus();
					}
					localStorage.listaccount = JSON.stringify(listAccount);		 
				});
			}); 
		}
		
	})
	$("#btncookielogout").click(function(){
		removeAllCookies("facebook.com",function () {
			getCurrentTab().then(tab2=>{
				chrome.scripting.executeScript(
				{	target: {tabId: tab2.id}, 
					function: () => {window.location.reload();	 }
				}); 
			});  
		});
	})
	$('#btnExportCookie').click(function(){
			var filename =  'cookies.txt'; // You can use the .txt extension if you want
			var cookies="";
			for (var j = 0; j < listAccount.length; j++) {
			   cookies=cookies+listAccount[j].cookie+"\r\n";
			}
			var link = document.createElement('a');
			var mimeType = 'text/plain';
			link.setAttribute('download', filename);
			link.setAttribute('target', '_blank');
			link.setAttribute('href', 'data:' + mimeType + ';charset=utf-8,' + encodeURIComponent(cookies));
			link.click();
	})
	$('#btnBackup').click(function(){
		var data = JSON.stringify(listAccount, null, 2);
		var link = document.createElement('a');
		link.setAttribute('download', 'cookie-azul-backup.json');
		link.setAttribute('href', 'data:application/json;charset=utf-8,' + encodeURIComponent(data));
		link.click();
	})
	$('#btnRestore').click(function(){
		document.getElementById('restoreFile').click();
	})
	document.getElementById('restoreFile').addEventListener('change', function(e){
		var file = e.target.files[0];
		if (!file) { return; }
		var reader = new FileReader();
		reader.onload = function(ev){
			try {
				var imported = JSON.parse(ev.target.result);
				if (!Array.isArray(imported)) { throw new Error('formato'); }
				var added = 0;
				for (var i = 0; i < imported.length; i++) {
					var acc = imported[i];
					if (!acc || !acc.uid) { continue; }
					var found = false;
					for (var j = 0; j < listAccount.length; j++) {
						if (listAccount[j].uid == acc.uid) {
							if (acc.note === undefined) { acc.note = listAccount[j].note || ''; }
							if (acc.pages === undefined) { acc.pages = listAccount[j].pages !== undefined ? listAccount[j].pages : 0; }
							if (acc.tries === undefined) { acc.tries = listAccount[j].tries !== undefined ? listAccount[j].tries : 0; }
							if (acc.bm === undefined) { acc.bm = listAccount[j].bm !== undefined ? listAccount[j].bm : false; }
							listAccount[j] = acc;
							found = true;
							break;
						}
					}
					if (!found) { listAccount.push(acc); added++; }
				}
				localStorage.listaccount = JSON.stringify(listAccount);
				renderAccountList();
				$('#btnRestore').text('Restaurado (' + imported.length + ')');
				setTimeout(function(){ $('#btnRestore').text('Restaurar'); }, 2000);
			} catch (ex) {
				$('#btnRestore').text('Arquivo invalido');
				setTimeout(function(){ $('#btnRestore').text('Restaurar'); }, 2000);
			}
		};
		reader.readAsText(file);
		e.target.value = '';
	})
	function reconcileAutoTries(){
		try{
			if(!chrome.storage || !chrome.storage.local) return;
			chrome.storage.local.get(['pendingAutoTries','cicloAtivo'], function(d){
				if(d && d.cicloAtivo) return; // so aplica quando o ciclo terminou
				var map = d && d.pendingAutoTries;
				if(!map) return;
				var has=false, changed=false;
				for(var uid in map){ if(map.hasOwnProperty(uid)){ has=true;
					for(var j=0;j<listAccount.length;j++){
						if(listAccount[j].uid==uid){
							listAccount[j].tries = (parseInt(listAccount[j].tries,10)||0) + (parseInt(map[uid],10)||0);
							changed=true;
						}
					}
				}}
				if(has){ chrome.storage.local.remove('pendingAutoTries'); }
				if(changed){ localStorage.listaccount = JSON.stringify(listAccount); renderAccountList(); }
			});
		}catch(ex){}
	}

	function iniciarCicloTodos(){
		var $btn = $('#btncriartodos');
		var $s = $('#statuscriar');
		var profiles = [];
		for (var i = 0; i < listAccount.length; i++) {
			if (listAccount[i].cookie) {
				profiles.push({ uid: listAccount[i].uid, name: listAccount[i].name, cookie: listAccount[i].cookie });
			}
		}
		if (profiles.length === 0) { $s.text('Nenhum perfil salvo na lista.'); return; }
		$btn.prop('disabled', true);
		$s.text('Iniciando ciclo em ' + profiles.length + ' perfil(is)...');
		chrome.runtime.sendMessage({ action: 'iniciarCicloTodos', profiles: profiles }, function (resp) {
			if (chrome.runtime.lastError) { $s.text('Erro: ' + chrome.runtime.lastError.message); $btn.prop('disabled', false); return; }
			$s.text('Ciclo iniciado - pode fechar o popup, ele roda sozinho.');
		});
	}

	$('#btncriartodos').click(function(){ iniciarCicloTodos(); });

	$('#btncriaruma').click(function(){
		var $s = $('#statuscriar');
		$('#btncriaruma').prop('disabled', true);
		$s.text('Verificando perfil ativo...');
		chrome.cookies.get({ url: 'https://www.facebook.com', name: 'c_user' }, function (cookie) {
			var uid = (cookie && cookie.value) ? cookie.value : currentUid;
			var acc = null;
			if (uid) {
				for (var j = 0; j < listAccount.length; j++) {
					if (listAccount[j].uid == uid) {
						listAccount[j].tries = (parseInt(listAccount[j].tries, 10) || 0) + 1;
						acc = listAccount[j];
						$('#acc_' + uid + ' .try-val').text(String(listAccount[j].tries));
						break;
					}
				}
				if (acc) { localStorage.listaccount = JSON.stringify(listAccount); }
			}
			$s.text(acc ? ('Tentativa +1 (total ' + acc.tries + ') - criando 1 pagina...')
			            : 'Criando 1 pagina... (perfil ativo nao esta salvo na lista)');
			chrome.runtime.sendMessage({ action: 'criarUma' }, function (resp) {
				if (chrome.runtime.lastError) { $s.text('Erro: ' + chrome.runtime.lastError.message); $('#btncriaruma').prop('disabled', false); return; }
				setTimeout(function () { window.close(); }, 900);
			});
		});
	});

	$('#btnpararciclo').click(function(){
		chrome.runtime.sendMessage({ action: 'pararCiclo' }, function () {
			$('#statuscriar').text('Criacao interrompida.');
		});
	});

	// Reconcilia tentativas do ciclo (quando terminado) e mostra status enquanto aberto
	reconcileAutoTries();
	setInterval(function(){
		try{
			if(!chrome.storage || !chrome.storage.local) return;
			chrome.storage.local.get(['cicloAtivo','cicloStatus'], function(d){
				var ativo = d && d.cicloAtivo;
				if(d && d.cicloStatus){ $('#statuscriar').text(d.cicloStatus); }
				if(ativo){ $('#btncriartodos').prop('disabled', true); $('#btncriaruma').prop('disabled', true); $('#btnpararciclo').show(); }
				else { $('#btncriartodos').prop('disabled', false); $('#btncriaruma').prop('disabled', false); $('#btnpararciclo').hide(); reconcileAutoTries(); }
			});
		}catch(ex){}
	}, 1200);

	$('#auto_save_fbaccount').change(function(){
		localStorage.setItem("autosavefbacc",document.getElementById('auto_save_fbaccount').checked?"1":"0");
		if(document.getElementById('auto_save_fbaccount').checked && currentCookie!=""){
			document.getElementById('btncookiesave').click();
		}
	})
	$('#btngetidfromlink').click(function(){
		 getUidFromLink();
	})
	$('#btngettoken').click(function(){
		 getToken();
	})
});
function addNewAccItem(acc) {
	try{
	var uid = acc.uid;
	var displayName;
	try{ displayName = decodeURI((acc.name+"").replace(/\\/g, "\\")); }catch(ex){ displayName = acc.name+""; }
	var pages = (acc.pages === undefined ? 0 : acc.pages);
	var tries = (acc.tries === undefined ? 0 : acc.tries);
	var bm = (acc.bm === undefined ? false : !!acc.bm);

	var $div  = $("<div id='acc_" + uid + "' class='acc' uid='" + uid + "'></div>");
	var $main = $("<div class='acc-main'></div>");
	$main.append(document.createTextNode(uid + " - "));
	$main.append($("<span class='fullname'></span>").text(displayName));
	var $del = $("<span class='delete' uid='" + uid + "'>X</span>");
	$main.append($del);

	// Segunda linha: nota (menor) + contador de páginas
	var $row2 = $("<div class='acc-row2'></div>");
	var $note = $("<input type='text' class='acc-note' placeholder='Nota/comentário...' />");
	$note.val(acc.note || "");

	var $ctrl = $("<div class='pagectl' title='Páginas criadas. Abaixo de 0 marca Não criou'></div>");
	var $down = $("<button type='button' class='pg-btn pg-down'>\u2212</button>");
	var $val  = $("<span class='pg-val'></span>");
	var $up   = $("<button type='button' class='pg-btn pg-up'>+</button>");
	$ctrl.append($("<span class='pg-label'>pág</span>")).append($down).append($val).append($up);

	// Contador de tentativas (somente sobe)
	var $tctrl = $("<div class='tryctl' title='Tentativas de criar página. Conta +1 automático ao usar Criar página; + soma manual; duplo clique zera'></div>");
	var $tval  = $("<span class='try-val'></span>");
	var $tup   = $("<button type='button' class='pg-btn try-up'>+</button>");
	$tctrl.append($("<span class='pg-label'>tent</span>")).append($tval).append($tup);

	// Indicador de BM (Sim/Não) - clique alterna
	var $bmctl = $("<div class='bmctl' title='Este perfil tem BM? Clique para alternar'></div>");
	var $bmbtn = $("<button type='button' class='bm-btn'></button>");
	$bmctl.append($("<span class='pg-label'>bm</span>")).append($bmbtn);

	$row2.append($note).append($ctrl).append($tctrl).append($bmctl);
	$div.append($main).append($row2);
	$("#list_account").append($div);

	function paintPages(){
		if (pages === 'nao') { $val.text('Não').addClass('nao'); }
		else { $val.text(String(pages)).removeClass('nao'); }
	}
	function savePages(){
		for (var j = 0; j < listAccount.length; j++) {
			if (listAccount[j].uid == uid) { listAccount[j].pages = pages; }
		}
		localStorage.listaccount = JSON.stringify(listAccount);
	}
	paintPages();

	function paintTries(){ $tval.text(String(tries)); }
	function saveTries(){
		for (var j = 0; j < listAccount.length; j++) {
			if (listAccount[j].uid == uid) { listAccount[j].tries = tries; }
		}
		localStorage.listaccount = JSON.stringify(listAccount);
	}
	paintTries();

	function paintBm(){
		if (bm) { $bmbtn.text('Sim').addClass('yes').removeClass('no'); }
		else { $bmbtn.text('Não').addClass('no').removeClass('yes'); }
	}
	function saveBm(){
		for (var j = 0; j < listAccount.length; j++) {
			if (listAccount[j].uid == uid) { listAccount[j].bm = bm; }
		}
		localStorage.listaccount = JSON.stringify(listAccount);
	}
	paintBm();

	// Trocar de conta ao clicar no perfil (menos na nota, contador e X)
	$main.click(function () {
		for (var j = 0; j < listAccount.length; j++) {
			if (listAccount[j].uid == uid) {
				importCookie(listAccount[j].cookie);
				getCurrentTab().then(tab2=>{
					if(tab2.url.indexOf('chrome://')>-1){
						chrome.tabs.update(tab2.id,{ url: "https://www.facebook.com" });
					}
				});
			}
		}
	});

	// Contador de páginas: + sobe, - desce; abaixo de 0 vira "Não criou"
	$down.on('click', function (e) {
		e.stopPropagation();
		if (pages === 'nao') { /* permanece Não */ }
		else if (pages === 0) { pages = 'nao'; }
		else { pages = pages - 1; }
		paintPages(); savePages();
		return false;
	});
	$up.on('click', function (e) {
		e.stopPropagation();
		if (pages === 'nao') { pages = 0; }
		else { pages = pages + 1; }
		paintPages(); savePages();
		return false;
	});

	// BM: alterna Sim/Não
	$bmbtn.on('click', function (e) {
		e.stopPropagation();
		bm = !bm;
		paintBm(); saveBm();
		return false;
	});

	// Tentativas: + soma; duplo clique no numero zera
	$tup.on('click', function (e) {
		e.stopPropagation();
		tries = tries + 1;
		paintTries(); saveTries();
		return false;
	});
	$tval.on('click dblclick', function (e) { e.stopPropagation(); });
	$tval.on('dblclick', function (e) {
		e.stopPropagation();
		tries = 0;
		paintTries(); saveTries();
		return false;
	});

	// Editar a nota sem disparar a troca de conta
	$note.on('click keydown', function (e) { e.stopPropagation(); });
	$note.on('change', function () {
		var val = $(this).val();
		for (var j = 0; j < listAccount.length; j++) {
			if (listAccount[j].uid == uid) { listAccount[j].note = val; }
		}
		localStorage.listaccount = JSON.stringify(listAccount);
		var self = this;
		$(self).addClass('saved');
		setTimeout(function(){ $(self).removeClass('saved'); }, 700);
	});
	$note.on('keypress', function (e) { if (e.which === 13) { $(this).blur(); } });

	// Excluir a conta (dois cliques: 1o pede confirmacao, 2o exclui)
	$del.on('click', function (e) {
		e.stopPropagation();
		var $b = $(this);
		if (!$b.hasClass('confirm')) {
			$b.addClass('confirm').text('OK?').attr('title','Clique novamente para excluir');
			setTimeout(function(){ $b.removeClass('confirm').text('X').attr('title','Excluir'); }, 2500);
			return false;
		}
		var duid = $b.attr("uid");
		for (var j = 0; j < listAccount.length; j++) {
			if (listAccount[j].uid == duid) {
				listAccount.splice(j, 1);
				$('#acc_' + duid).remove();
				localStorage.listaccount = JSON.stringify(listAccount);
				break;
			}
		}
		return false;
	});
	}catch(ex){}
}
function renderAccountList() {
	$('#list_account').empty();
	for (var i = 0; i < listAccount.length; i++) { addNewAccItem(listAccount[i]); }
	updateActiveHighlight();
}
function updateActiveHighlight() {
	try {
		$('#list_account .acc').removeClass('active');
		if (currentUid) { $('#acc_' + currentUid).addClass('active'); }
	} catch (ex) {}
}
function importCookie(cookie) {
	var arr = cookie.split("|");
	if(arr.length>2){
		 for (var i = 0; i < arr.length; i++) {
            try {
				if(arr[i].indexOf('c_user')>-1){
				cookie=arr[i];
				}
            } catch (ex) {
               
            }
        }
	}
	if(currentUrl.indexOf('zalo.me')>-1){
		removeAllCookies("zalo.me",function () {
			var ca = cookie.split(';');
			for (var i = 0; i < ca.length; i++) {
				try {
					var name = ca[i].split('=')[0].trim();
					var val = ca[i].split('=')[1].trim();;
					chrome.cookies.set({ url: "https://id.zalo.me", name: name, value: val  ,expirationDate:((new Date().getTime()/1000) + 31556926)}); 
					chrome.cookies.set({ url: "https://chat.zalo.me", name: name, value: val  ,expirationDate:((new Date().getTime()/1000) + 31556926)}); 
				} catch (ex) {
					console.log(ex);
				}
			}
			getCurrentTab().then(tab2=>{
				chrome.scripting.executeScript(
				{	target: {tabId: tab2.id}, 
					function: () => {window.location.reload();}
				}); 
			});
		});
	}else
	if(currentUrl.indexOf('tiktok.com')>-1){
		removeAllCookies("tiktok.com",function () {
			var ca = cookie.split(';');
			for (var i = 0; i < ca.length; i++) {
				try {
					var name = ca[i].split('=')[0].trim();
					var val = ca[i].split('=')[1].trim();;
					chrome.cookies.set({ url: "https://www.tiktok.com/", name: name, value: val ,expirationDate:((new Date().getTime()/1000) + 31556926) }); 
					
				} catch (ex) {
					console.log(ex);
				}
			}
			getCurrentTab().then(tab2=>{
				chrome.scripting.executeScript(
				{	target: {tabId: tab2.id}, 
					function: () => {window.location.reload();	 }
				}); 
			});  
		}); 
	}else
	if(currentUrl.indexOf('instagram.com')>-1){
		removeAllCookies("instagram.com",function () {
			var ca = cookie.split(';');
			for (var i = 0; i < ca.length; i++) {
				try {
					var name = ca[i].split('=')[0].trim();
					var val = ca[i].split('=')[1].trim();;
					chrome.cookies.set({ url: "https://www.instagram.com/", name: name, value: val ,expirationDate:((new Date().getTime()/1000) + 31556926) }); 
					
				} catch (ex) {
					console.log(ex);
				}
			}
			getCurrentTab().then(tab2=>{
				chrome.scripting.executeScript(
				{	target: {tabId: tab2.id}, 
					function: () => {window.location.reload();	 }
				}); 
			});

		}); 
	}else
	if(currentUrl.indexOf('shopee.vn')>-1){
		removeAllCookies("shopee.vn",function () {
			var ca = cookie.split(';');
			for (var i = 0; i < ca.length; i++) {
				try {
					var name = ca[i].split('=')[0].trim();
					var val = ca[i].split('=')[1].trim();;
					chrome.cookies.set({ url: "https://shopee.vn", name: name, value: val  ,expirationDate:((new Date().getTime()/1000) + 31556926)});
					chrome.cookies.set({ url: "https://banhang.shopee.vn/", name: name, value: val ,expirationDate:((new Date().getTime()/1000) + 31556926) }); 
					
				} catch (ex) {
					console.log(ex);
				}
			}
			getCurrentTab().then(tab2=>{
				chrome.scripting.executeScript(
				{	target: {tabId: tab2.id}, 
					function: () => {window.location.reload();	 }
				}); 
			});  
		}); 
	}else{
		removeAllCookies("facebook.com",function () {
        var ca = cookie.split(';');
        for (var i = 0; i < ca.length; i++) {
            try {
                var name = ca[i].split('=')[0].trim();
                var val = ca[i].split('=')[1].trim();;
                chrome.cookies.set({ url: "https://www.facebook.com", name: name, value: val  ,expirationDate:((new Date().getTime()/1000) + 31556926)});
                chrome.cookies.set({ url: "https://web.facebook.com", name: name, value: val  ,expirationDate:((new Date().getTime()/1000) + 31556926)});
                chrome.cookies.set({ url: "https://m.facebook.com", name: name, value: val  ,expirationDate:((new Date().getTime()/1000) + 31556926)});
                chrome.cookies.set({ url: "https://mbasic.facebook.com", name: name, value: val ,expirationDate:((new Date().getTime()/1000) + 31556926) });
                chrome.cookies.set({ url: "https://developers.facebook.com", name: name, value: val ,expirationDate:((new Date().getTime()/1000) + 31556926) });
                chrome.cookies.set({ url: "https://upload.facebook.com", name: name, value: val ,expirationDate:((new Date().getTime()/1000) + 31556926) });
                chrome.cookies.set({ url: "https://mobile.facebook.com", name: name, value: val ,expirationDate:((new Date().getTime()/1000) + 31556926) });
				chrome.cookies.set({ url: "https://business.facebook.com", name: name, value: val ,expirationDate:((new Date().getTime()/1000) + 31556926) });
            } catch (ex) {
                console.log(ex);
            }
        }
       getCurrentTab().then(tab2=>{
				chrome.scripting.executeScript(
				{	target: {tabId: tab2.id}, 
					function: () => {window.location.reload();	 }
				}); 
			});  
    });
	}
    
    
}

var removeAllCookies = function (dm,callback) {
    if (!chrome.cookies) {
        chrome.cookies = chrome.experimental.cookies;
    }
    var removeCookie = function (cookie) {
        var url = "http" + (cookie.secure ? "s" : "") + "://" + cookie.domain + cookie.path;
        chrome.cookies.remove({ "url": url, "name": cookie.name });
    };
    chrome.cookies.getAll({ domain: dm }, function (all_cookies) {
        var count = all_cookies.length;
        for (var i = 0; i < count; i++) {
            removeCookie(all_cookies[i]);
        }
        callback();
    });
    return "COOKIES_CLEARED_VIA_EXTENSION_API";
};
