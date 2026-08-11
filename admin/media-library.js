/*
  自定义图片媒体库：
  - 上传图片时自动压缩（限制最大宽度 + JPEG 质量）
  - 支持在后台裁剪宽度 / 高度
  - 通过 GitHub API 直接写入仓库（使用 Decap 已登录的 token）
  - 同时提供浏览已有图片并插入的能力
*/
(function () {
  var CMS = window.CMS;
  if (!CMS || typeof CMS.registerMediaLibrary !== 'function') return;

  var modal = null;
  var handleInsertRef = null;
  var repoInfoPromise = null;

  var el = function (tag, attrs, children) {
    var node = document.createElement(tag);
    for (var k in (attrs || {})) {
      if (k === 'style') node.style.cssText = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), attrs[k]);
      else node.setAttribute(k, attrs[k]);
    }
    var list = children == null ? [] : (Array.isArray(children) ? children : [children]);
    list.forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return node;
  };

  function getRepoInfo() {
    if (repoInfoPromise) return repoInfoPromise;
    repoInfoPromise = fetch('config.yml', { cache: 'no-store' })
      .then(function (r) { return r.text(); })
      .then(function (text) {
        function grab(re) { var m = text.match(re); return m ? m[1].replace(/["'\s]+$/, '') : ''; }
        return {
          repo: grab(/^\s*repo:\s*["']?([^"'\s#]+)/m),
          branch: grab(/^\s*branch:\s*["']?([^"'\s#]+)/m) || 'main',
          mediaFolder: grab(/^\s*media_folder:\s*["']?([^"'\s#]+)/m) || 'images/uploads',
        };
      })
      .catch(function () {
        return { repo: '', branch: 'main', mediaFolder: 'images/uploads' };
      });
    return repoInfoPromise;
  }

  function getToken() {
    try {
      var raw = window.localStorage.getItem('decap-cms-user');
      if (!raw) return null;
      var d = JSON.parse(raw);
      var u = d && d.user;
      if (u) {
        if (typeof u.get === 'function') {
          var t = u.get('token');
          if (t) return t;
        }
        if (u.token) return u.token;
      }
      if (d && d.token) return d.token;
      return null;
    } catch (e) { return null; }
  }

  function api(path, method, body) {
    var tk = getToken();
    var headers = { 'Authorization': 'token ' + tk, 'Accept': 'application/vnd.github+json' };
    if (body) headers['Content-Type'] = 'application/json';
    return getRepoInfo().then(function (info) {
      if (!info.repo) throw new Error('无法读取仓库配置');
      return fetch('https://api.github.com/repos/' + info.repo + path, {
        method: method || 'GET',
        headers: headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    }).then(function (r) {
      if (r.status === 204) return null;
      return r.json().then(function (j) {
        if (r.ok) return j;
        throw new Error((j && j.message) || ('HTTP ' + r.status));
      });
    }).catch(function (e) {
      if (e && e.message) throw e;
      throw new Error('网络错误');
    });
  }

  function uploadImage(filePath, blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        var base64 = String(fr.result).split(',')[1];
        getRepoInfo().then(function (info) {
          return api('/contents/' + filePath.replace(/^\/+/, ''), 'PUT', {
            message: 'Upload image',
            content: base64,
            branch: info.branch,
          });
        }).then(function () { resolve(filePath); }).catch(reject);
      };
      fr.onerror = function () { reject(new Error('读取文件失败')); };
      fr.readAsDataURL(blob);
    });
  }

  function listImages(folder) {
    return getRepoInfo().then(function (info) {
      return api('/contents/' + encodeURIComponent(folder) + '?ref=' + encodeURIComponent(info.branch), 'GET');
    }).then(function (items) {
      if (!Array.isArray(items)) return [];
      return items.filter(function (x) {
        return x.type === 'file' && /\.(jpe?g|png|gif|webp)$/i.test(x.name);
      }).map(function (x) { return x.path; });
    }).catch(function () { return []; });
  }

  function processImage(file, opts) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var objUrl = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(objUrl);
        var sw = img.naturalWidth, sh = img.naturalHeight;
        var cw = Math.min(opts.cropWidth > 0 ? opts.cropWidth : sw, sw);
        var ch = Math.min(opts.cropHeight > 0 ? opts.cropHeight : sh, sh);
        var scale = Math.min(1, (opts.maxWidth > 0 ? opts.maxWidth : 1920) / cw);
        var ow = Math.max(1, Math.round(cw * scale));
        var oh = Math.max(1, Math.round(ch * scale));
        var cv = document.createElement('canvas');
        cv.width = ow; cv.height = oh;
        var ctx = cv.getContext('2d');
        ctx.drawImage(img, Math.round((sw - cw) / 2), Math.round((sh - ch) / 2), cw, ch, 0, 0, ow, oh);
        cv.toBlob(function (b) {
          if (b) resolve(b);
          else reject(new Error('图片处理失败'));
        }, opts.format || 'image/jpeg', opts.quality || 0.8);
      };
      img.onerror = function () { URL.revokeObjectURL(objUrl); reject(new Error('无法读取图片')); };
      img.src = objUrl;
    });
  }

  function sanitizeName(name) {
    var base = name.replace(/\.[^.]+$/, '');
    base = base.replace(/[^\w\u4e00-\u9fa5-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!base) base = 'image-' + Date.now();
    return base;
  }

  function buildModal() {
    var folderInput = el('input', { type: 'text', style: 'width:100%;padding:4px;box-sizing:border-box;' });
    var browseFolder = el('input', { type: 'text', style: 'width:100%;padding:4px;box-sizing:border-box;' });
    getRepoInfo().then(function (info) {
      var def = info.mediaFolder || 'images/uploads';
      if (!folderInput.value) folderInput.value = def;
      if (!browseFolder.value) browseFolder.value = def;
    });

    // ---------- 上传 tab ----------
    var fileInput = el('input', { type: 'file', accept: 'image/*' });
    var preview = el('img', { style: 'max-width:100%;max-height:220px;border-radius:4px;display:none;object-fit:contain;' });
    var maxWInput = el('input', { type: 'number', value: '1920', min: '16', style: 'width:90px;padding:4px;' });
    var qualityInput = el('input', { type: 'range', min: '30', max: '100', value: '80', style: 'width:140px;' });
    var qualityLabel = el('span', { style: 'font-size:12px;color:#666;min-width:36px;' }, '80%');
    var cropWInput = el('input', { type: 'number', placeholder: '不限', min: '1', style: 'width:90px;padding:4px;' });
    var cropHInput = el('input', { type: 'number', placeholder: '不限', min: '1', style: 'width:90px;padding:4px;' });
    var status = el('div', { style: 'margin-top:8px;font-size:12px;color:#666;min-height:16px;' });
    var uploadBtn = el('button', { type: 'button', disabled: true, style: 'padding:6px 14px;cursor:pointer;' }, '请先选择图片');

    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) { preview.style.display = 'none'; uploadBtn.disabled = true; uploadBtn.textContent = '请先选择图片'; return; }
      var url = URL.createObjectURL(f);
      preview.onload = function () { URL.revokeObjectURL(url); };
      preview.src = url;
      preview.style.display = 'block';
      uploadBtn.disabled = false;
      uploadBtn.textContent = '处理并上传';
      status.style.color = '#666';
      status.textContent = '已选择：' + f.name + '（' + Math.round(f.size / 1024) + ' KB）';
    });

    qualityInput.addEventListener('input', function () { qualityLabel.textContent = qualityInput.value + '%'; });

    function doUpload() {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      var folder = (folderInput.value || '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
      var opts = {
        maxWidth: parseInt(maxWInput.value, 10) || 1920,
        quality: (parseInt(qualityInput.value, 10) || 80) / 100,
        cropWidth: parseInt(cropWInput.value, 10) || 0,
        cropHeight: parseInt(cropHInput.value, 10) || 0,
      };
      uploadBtn.disabled = true;
      status.style.color = '#666';
      status.textContent = '正在处理并上传…';
      processImage(f, opts)
        .then(function (blob) {
          var filePath = (folder ? folder + '/' : '') + sanitizeName(f.name) + '.jpg';
          return uploadImage(filePath, blob).then(function () { return filePath; });
        })
        .then(function (filePath) {
          status.textContent = '上传成功：' + filePath;
          if (handleInsertRef) handleInsertRef(filePath);
          setTimeout(closeModal, 600);
        })
        .catch(function (e) {
          uploadBtn.disabled = false;
          uploadBtn.textContent = '处理并上传';
          status.style.color = '#c0392b';
          status.textContent = '上传失败：' + (e && e.message ? e.message : '未知错误');
        });
    }
    uploadBtn.addEventListener('click', doUpload);

    var uploadPane = el('div', null, [
      el('div', { style: 'margin-bottom:10px;' }, [
        el('label', { style: 'display:block;font-weight:600;margin-bottom:4px;' }, '选择图片（上传时自动压缩）'),
        fileInput,
      ]),
      preview,
      el('div', { style: 'margin:12px 0;display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px;' }, [
        el('div', null, [el('label', { style: 'display:block;margin-bottom:3px;' }, '最大宽度（像素）'), maxWInput]),
        el('div', null, [el('label', { style: 'display:block;margin-bottom:3px;' }, '图片质量'), el('div', { style: 'display:flex;align-items:center;gap:6px;' }, [qualityInput, qualityLabel])]),
        el('div', null, [el('label', { style: 'display:block;margin-bottom:3px;' }, '裁剪宽度（可选，居中裁剪）'), cropWInput]),
        el('div', null, [el('label', { style: 'display:block;margin-bottom:3px;' }, '裁剪高度（可选）'), cropHInput]),
      ]),
      el('div', { style: 'margin-bottom:10px;' }, [
        el('label', { style: 'display:block;margin-bottom:3px;font-size:13px;' }, '保存到（需与当前栏目图片目录一致）'),
        folderInput,
      ]),
      el('div', { style: 'display:flex;gap:10px;align-items:center;' }, [uploadBtn, el('button', { type: 'button', style: 'padding:6px 14px;cursor:pointer;', onclick: closeModal }, '取消')]),
      status,
    ]);

    // ---------- 已有图片 tab ----------
    var browseGrid = el('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:10px;max-height:360px;overflow:auto;' });
    var browseStatus = el('div', { style: 'margin-top:8px;font-size:12px;color:#666;min-height:16px;' });
    var browseBtn = el('button', { type: 'button', style: 'padding:6px 14px;cursor:pointer;' }, '加载图片');

    function loadBrowse() {
      var folder = (browseFolder.value || '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
      browseGrid.innerHTML = '';
      browseStatus.style.color = '#666';
      browseStatus.textContent = '加载中…';
      listImages(folder).then(function (paths) {
        browseGrid.innerHTML = '';
        if (!paths.length) { browseStatus.textContent = '该目录下没有图片。'; return; }
        browseStatus.textContent = '共 ' + paths.length + ' 张，点击插入（原图，不做处理）。';
        getRepoInfo().then(function (info) {
          paths.forEach(function (p) {
            var thumb = el('img', { style: 'width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:4px;cursor:pointer;border:1px solid #ddd;' });
            thumb.src = 'https://raw.githubusercontent.com/' + info.repo + '/' + info.branch + '/' + p;
            thumb.title = p;
            thumb.addEventListener('click', function () {
              if (handleInsertRef) handleInsertRef(p);
              closeModal();
            });
            browseGrid.appendChild(el('div', null, [thumb]));
          });
        });
      });
    }
    browseBtn.addEventListener('click', loadBrowse);

    var browsePane = el('div', { style: 'display:none;' }, [
      el('div', { style: 'display:flex;gap:8px;margin-bottom:10px;' }, [
        el('label', { style: 'align-self:center;font-size:13px;' }, '目录'),
        browseFolder,
        browseBtn,
      ]),
      browseGrid,
      browseStatus,
    ]);

    // ---------- tabs ----------
    var uploadTab = el('button', { type: 'button', style: 'padding:6px 12px;cursor:pointer;font-weight:600;' }, '上传新图片');
    var browseTab = el('button', { type: 'button', style: 'padding:6px 12px;cursor:pointer;' }, '已有图片');

    function switchTab(which) {
      var isUpload = which === 'upload';
      uploadPane.style.display = isUpload ? 'block' : 'none';
      browsePane.style.display = isUpload ? 'none' : 'block';
      uploadTab.style.fontWeight = isUpload ? '600' : '400';
      browseTab.style.fontWeight = isUpload ? '400' : '600';
      if (!isUpload) loadBrowse();
    }
    uploadTab.addEventListener('click', function () { switchTab('upload'); });
    browseTab.addEventListener('click', function () { switchTab('browse'); });

    var box = el('div', { style: 'background:#fff;color:#333;border-radius:8px;padding:20px;width:640px;max-width:92vw;max-height:90vh;overflow:auto;box-sizing:border-box;' }, [
      el('div', { style: 'display:flex;gap:8px;margin-bottom:14px;' }, [uploadTab, browseTab]),
      uploadPane,
      browsePane,
    ]);

    modal = el('div', {
      style: 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:center;justify-content:center;z-index:99999;',
    }, [box]);

    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    document.body.appendChild(modal);
  }

  function openModal(params) {
    handleInsertRef = params.handleInsert;
    if (!modal) buildModal();
    modal.style.display = 'flex';
  }

  function closeModal() {
    if (modal) modal.style.display = 'none';
  }

  var mediaLibrary = {
    name: 'imagelib',
    init: function (args) {
      var insert = args && args.handleInsert;
      return {
        show: function (p) { openModal({ value: p && p.value, handleInsert: insert }); },
        hide: function () { closeModal(); },
        enableStandalone: function () { return false; },
      };
    },
  };

  CMS.registerMediaLibrary(mediaLibrary);
})();
