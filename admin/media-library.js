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
  var isImageMode = true;
  var applyModeFn = null;
  var applyMediaConfigFn = null;
  var currentValue = null;
  var currentMediaConfig = {};
  var folderInputs = [];

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

  function toPlain(value) {
    if (!value) return {};
    if (typeof value.toJS === 'function') return value.toJS();
    return value;
  }

  function normalizeMediaConfig(value) {
    var config = toPlain(value);
    if (config && config.config) {
      config = Object.assign({}, config, toPlain(config.config));
      delete config.config;
    }
    return config || {};
  }

  function getRepoInfo() {
    if (repoInfoPromise) return repoInfoPromise;
    repoInfoPromise = fetch('config.yml', { cache: 'no-store' })
      .then(function (r) { return r.text(); })
      .then(function (text) {
        function grab(re) { var m = text.match(re); return m ? m[1].replace(/["'\s]+$/, '') : ''; }
        // 各集合（栏目）的 public_folder，用于智能默认保存目录
        var collections = {};
        var blocks = text.split(/\n\s*-\s*name:\s*/).slice(1);
        blocks.forEach(function (b) {
          var name = (b.match(/^([^\s#]+)/) || [])[1];
          if (!name) return;
          var pf = (b.match(/public_folder:\s*["']?([^"'\s#]+)/) || [])[1];
          if (pf) collections[name] = pf.replace(/^\/+/, '').replace(/\/+$/, '');
        });
        return {
          repo: grab(/^\s*repo:\s*["']?([^"'\s#]+)/m),
          branch: grab(/^\s*branch:\s*["']?([^"'\s#]+)/m) || 'main',
          mediaFolder: grab(/^\s*media_folder:\s*["']?([^"'\s#]+)/m) || 'images/uploads',
          collections: collections,
        };
      })
      .catch(function () {
        return { repo: '', branch: 'main', mediaFolder: 'images/uploads', collections: {} };
      });
    return repoInfoPromise;
  }

  function currentCollectionName() {
    var h = window.location.hash || '';
    var m = h.match(/collections\/([^\/]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function defaultFolder(info, value) {
    if (value && value.indexOf('/') >= 0) {
      var dir = value.substring(0, value.lastIndexOf('/'));
      if (dir) return dir;
    }
    var coll = currentCollectionName();
    if (coll && info.collections && info.collections[coll]) return info.collections[coll];
    return info.mediaFolder || 'images/uploads';
  }

  function siteRootUrl() {
    var path = window.location.pathname || '/';
    var lower = path.toLowerCase();
    var i = lower.lastIndexOf('/admin');
    if (i >= 0) path = path.slice(0, i + 1);
    else path = path.replace(/\/[^/]*$/, '/');
    if (path.charAt(0) !== '/') path = '/' + path;
    return window.location.origin + path;
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
          var path = filePath.replace(/^\/+/, '');
          return api('/contents/' + path, 'GET')
            .then(function (existing) {
              return existing && existing.sha ? existing.sha : null;
            })
            .catch(function () {
              return null; // 文件不存在 → 新建，无需 sha
            })
            .then(function (sha) {
              var body = { message: 'Upload image', content: base64, branch: info.branch };
              if (sha) body.sha = sha; // 覆盖已存在文件时需要 sha
              return api('/contents/' + path, 'PUT', body);
            });
        }).then(function () { resolve(filePath); }).catch(reject);
      };
      fr.onerror = function () { reject(new Error('读取文件失败')); };
      fr.readAsDataURL(blob);
    });
  }

  function deleteImage(filePath) {
    return getRepoInfo().then(function (info) {
      var path = filePath.replace(/^\/+/, '');
      return api('/contents/' + path, 'GET').then(function (existing) {
        if (!existing || !existing.sha) throw new Error('未找到该文件');
        return api('/contents/' + path, 'DELETE', {
          message: 'Delete image',
          sha: existing.sha,
          branch: info.branch,
        });
      });
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
        var sx = 0, sy = 0, cw = sw, ch = sh;
        if (opts.cropDisplay) {
          var c = opts.cropDisplay;
          sx = Math.max(0, Math.min(Math.round(c.x * sw / c.sw), sw - 1));
          sy = Math.max(0, Math.min(Math.round(c.y * sh / c.sh), sh - 1));
          cw = Math.max(1, Math.min(Math.round(c.w * sw / c.sw), sw - sx));
          ch = Math.max(1, Math.min(Math.round(c.h * sh / c.sh), sh - sy));
        }
        var scale = opts.maxWidth > 0 ? Math.min(1, opts.maxWidth / cw) : 1;
        var ow = Math.max(1, Math.round(cw * scale));
        var oh = Math.max(1, Math.round(ch * scale));
        var cv = document.createElement('canvas');
        cv.width = ow; cv.height = oh;
        var ctx = cv.getContext('2d');
        ctx.drawImage(img, sx, sy, cw, ch, 0, 0, ow, oh);
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
    folderInputs.push(folderInput, browseFolder);
    getRepoInfo().then(function (info) {
      var def = defaultFolder(info, currentValue);
      if (!folderInput.value) folderInput.value = def;
      if (!browseFolder.value) browseFolder.value = def;
    });

    // ---------- 上传 tab ----------
    var fileInput = el('input', { type: 'file', accept: 'image/*' });
    var preview = el('img', { style: 'display:block;max-width:100%;max-height:220px;width:auto;height:auto;border-radius:4px;' });
    var cropBox = el('div', { style: 'position:absolute;display:none;border:2px solid #fff;box-shadow:0 0 0 9999px rgba(0,0,0,.55);cursor:move;touch-action:none;' });
    var cropWrap = el('div', { style: 'position:relative;display:block;width:fit-content;max-width:100%;margin-top:8px;' }, [preview, cropBox]);
    var handleStyles = {
      nw: 'left:-6px;top:-6px;cursor:nwse-resize;',
      n: 'left:50%;top:-6px;margin-left:-6px;cursor:ns-resize;',
      ne: 'right:-6px;top:-6px;cursor:nesw-resize;',
      e: 'right:-6px;top:50%;margin-top:-6px;cursor:ew-resize;',
      se: 'right:-6px;bottom:-6px;cursor:nwse-resize;',
      s: 'left:50%;bottom:-6px;margin-left:-6px;cursor:ns-resize;',
      sw: 'left:-6px;bottom:-6px;cursor:nesw-resize;',
      w: 'left:-6px;top:50%;margin-top:-6px;cursor:ew-resize;',
    };
    Object.keys(handleStyles).forEach(function (pos) {
      cropBox.appendChild(el('div', {
        'data-handle': pos,
        style: 'position:absolute;width:12px;height:12px;background:#fff;border:1px solid #666;' + handleStyles[pos],
      }));
    });

    var cropInteraction = null;

    function cropRatio() {
      if (String(currentMediaConfig.crop_ratio).toLowerCase() === 'original') {
        if (preview.naturalWidth && preview.naturalHeight) {
          return preview.naturalWidth / preview.naturalHeight;
        }
        return 0;
      }
      var ratio = parseFloat(currentMediaConfig.crop_ratio);
      return isFinite(ratio) && ratio > 0 ? ratio : 0;
    }

    function cropPos(e) {
      var rect = preview.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function setCropRect(x, y, w, h) {
      var s = { w: preview.clientWidth, h: preview.clientHeight };
      x = Math.max(0, Math.min(x, s.w));
      y = Math.max(0, Math.min(y, s.h));
      w = Math.max(1, w);
      h = Math.max(1, h);
      var ratio = cropRatio();
      if (ratio) {
        if (w / h > ratio) w = h * ratio;
        else h = w / ratio;
      }
      var scale = Math.min(1, (s.w - x) / w, (s.h - y) / h);
      w = Math.max(1, w * scale);
      h = Math.max(1, h * scale);
      cropBox.style.left = x + 'px';
      cropBox.style.top = y + 'px';
      cropBox.style.width = w + 'px';
      cropBox.style.height = h + 'px';
      cropBox.style.display = 'block';
    }

    function fitCropToRatio() {
      var ratio = cropRatio();
      if (!ratio || !preview.clientWidth || !preview.clientHeight) {
        cropBox.style.display = 'none';
        return;
      }
      var sw = preview.clientWidth;
      var sh = preview.clientHeight;
      var w = sw;
      var h = w / ratio;
      if (h > sh) {
        h = sh;
        w = h * ratio;
      }
      setCropRect((sw - w) / 2, (sh - h) / 2, w, h);
    }

    function getCropDisplayRect() {
      if (cropBox.style.display === 'none') return null;
      var s = { w: preview.clientWidth, h: preview.clientHeight };
      if (!s.w || !s.h) return null;
      return {
        x: parseFloat(cropBox.style.left) || 0,
        y: parseFloat(cropBox.style.top) || 0,
        w: parseFloat(cropBox.style.width) || 0,
        h: parseFloat(cropBox.style.height) || 0,
        sw: s.w, sh: s.h,
      };
    }

    cropWrap.addEventListener('mousedown', function (e) {
      if (cropBox.style.display === 'none' && e.target !== preview) return;
      e.preventDefault();
      var p = cropPos(e);
      var handle = e.target && e.target.getAttribute ? e.target.getAttribute('data-handle') : null;
      if (handle) {
        cropInteraction = { mode: 'resize', handle: handle, p: p, o: getCropDisplayRect() };
      } else if (e.target === cropBox) {
        cropInteraction = { mode: 'move', p: p, o: getCropDisplayRect() };
      } else if (e.target === preview) {
        cropInteraction = { mode: 'draw', startX: p.x, startY: p.y };
        setCropRect(p.x, p.y, 1, 1);
      }
    });

    document.addEventListener('mousemove', function (e) {
      if (!cropInteraction) return;
      e.preventDefault();
      var p = cropPos(e);
      var it = cropInteraction;
      if (it.mode === 'draw') {
        var x = Math.min(it.startX, p.x), y = Math.min(it.startY, p.y);
        setCropRect(x, y, Math.abs(p.x - it.startX), Math.abs(p.y - it.startY));
      } else if (it.mode === 'move') {
        setCropRect(it.o.x + (p.x - it.p.x), it.o.y + (p.y - it.p.y), it.o.w, it.o.h);
      } else if (it.mode === 'resize') {
        var o = it.o, hd = it.handle;
        var x2 = o.x + o.w, y2 = o.y + o.h;
        if (hd.indexOf('w') >= 0) o.x = p.x;
        if (hd.indexOf('e') >= 0) x2 = p.x;
        if (hd.indexOf('n') >= 0) o.y = p.y;
        if (hd.indexOf('s') >= 0) y2 = p.y;
        if (x2 < o.x) { var tx = o.x; o.x = x2; x2 = tx; }
        if (y2 < o.y) { var ty = o.y; o.y = y2; y2 = ty; }
        setCropRect(o.x, o.y, x2 - o.x, y2 - o.y);
      }
    });

    document.addEventListener('mouseup', function () { cropInteraction = null; });

    var maxWInput = el('input', { type: 'number', value: '1920', min: '16', placeholder: '留空不缩放', style: 'width:110px;padding:4px;' });
    var qualityInput = el('input', { type: 'range', min: '30', max: '100', value: '80', style: 'width:140px;' });
    var qualityLabel = el('span', { style: 'font-size:12px;color:#666;min-width:36px;' }, '80%');
    var cropHelp = el('div', { style: 'margin:10px 0;font-size:12px;color:#666;' }, '选择图片后，可在预览图上拖动绘制裁剪范围，拖动选框或边角可调整。不裁剪则使用整张图。');
    var cropPresetBtn = el('button', { type: 'button', style: 'display:none;margin-top:8px;padding:5px 10px;cursor:pointer;' }, '恢复推荐裁剪框');
    var status = el('div', { style: 'margin-top:8px;font-size:12px;color:#666;min-height:16px;' });
    var uploadBtn = el('button', { type: 'button', disabled: true, style: 'padding:6px 14px;cursor:pointer;' }, '请先选择图片');

    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) { cropWrap.style.display = 'none'; uploadBtn.disabled = true; uploadBtn.textContent = '请先选择图片'; return; }
      var url = URL.createObjectURL(f);
      preview.onload = function () {
        URL.revokeObjectURL(url);
        cropWrap.style.display = 'block';
        if (cropRatio()) fitCropToRatio();
        else cropBox.style.display = 'none';
      };
      preview.src = url;
      uploadBtn.disabled = false;
      uploadBtn.textContent = '处理并上传';
      status.style.color = '#666';
      status.textContent = '已选择：' + f.name + '（' + Math.round(f.size / 1024) + ' KB）';
    });

    qualityInput.addEventListener('input', function () { qualityLabel.textContent = qualityInput.value + '%'; });
    cropPresetBtn.addEventListener('click', fitCropToRatio);

    function applyMediaConfig() {
      var ratio = cropRatio();
      var label = currentMediaConfig.crop_label || '';
      cropPresetBtn.style.display = ratio ? 'inline-block' : 'none';
      cropHelp.textContent = ratio
        ? '已锁定为' + (label ? '“' + label + '”' : '推荐横幅比例') + '。拖动裁剪框可调整位置，拖动边角可等比例缩放。'
        : '选择图片后，可在预览图上拖动绘制裁剪范围，拖动选框或边角可调整。不裁剪则使用整张图。';
      if (currentMediaConfig.max_width) maxWInput.value = String(currentMediaConfig.max_width);
      else maxWInput.value = '1920';
      if (currentMediaConfig.quality) qualityInput.value = String(currentMediaConfig.quality);
      else qualityInput.value = '80';
      qualityLabel.textContent = qualityInput.value + '%';
      if (preview.complete && preview.naturalWidth && ratio) fitCropToRatio();
    }
    applyMediaConfigFn = applyMediaConfig;

    function doUpload() {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      var folder = (folderInput.value || '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
      var maxW = maxWInput.value.trim() === '' ? 0 : (parseInt(maxWInput.value, 10) || 1920);
      var opts = {
        maxWidth: maxW,
        quality: (parseInt(qualityInput.value, 10) || 80) / 100,
        cropDisplay: getCropDisplayRect(),
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
      cropWrap,
      cropPresetBtn,
      cropHelp,
      el('div', { style: 'margin:12px 0;display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px;' }, [
        el('div', null, [el('label', { style: 'display:block;margin-bottom:3px;' }, '输出最大宽度（裁剪后等比缩小，留空不缩放）'), maxWInput]),
        el('div', null, [el('label', { style: 'display:block;margin-bottom:3px;' }, '图片质量'), el('div', { style: 'display:flex;align-items:center;gap:6px;' }, [qualityInput, qualityLabel])]),
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

    function deleteBrowseImage(path) {
      if (!window.confirm('确定删除图片：' + path + ' ？此操作会直接提交到仓库。')) return;
      browseStatus.style.color = '#666';
      browseStatus.textContent = '正在删除…';
      deleteImage(path)
        .then(function () {
          browseStatus.textContent = '已删除：' + path;
          loadBrowse();
        })
        .catch(function (e) {
          browseStatus.style.color = '#c0392b';
          browseStatus.textContent = '删除失败：' + (e && e.message ? e.message : '未知错误');
        });
    }

    function loadBrowse() {
      var folder = (browseFolder.value || '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
      browseGrid.innerHTML = '';
      browseStatus.style.color = '#666';
      browseStatus.textContent = '加载中…';
      listImages(folder).then(function (paths) {
        browseGrid.innerHTML = '';
        if (!paths.length) { browseStatus.textContent = '该目录下没有图片。'; return; }
        browseStatus.textContent = '共 ' + paths.length + ' 张。点击图片插入，点击右上角 ✕ 删除。';
        getRepoInfo().then(function (info) {
          paths.forEach(function (p) {
            var thumb = el('img', { style: 'width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:4px;cursor:pointer;border:1px solid #ddd;display:block;' });
            thumb.src = siteRootUrl() + p;
            thumb.onerror = function () {
              // 站点内无法加载时，回退到 raw.githubusercontent.com
              thumb.onerror = null;
              getRepoInfo().then(function (info) {
                thumb.src = 'https://raw.githubusercontent.com/' + info.repo + '/' + info.branch + '/' + p;
              });
            };
            thumb.title = p;
            thumb.addEventListener('click', function () {
              if (handleInsertRef) handleInsertRef(p);
              closeModal();
            });
            var delBtn = el('button', {
              type: 'button',
              style: 'position:absolute;top:2px;right:2px;padding:2px 6px;font-size:12px;line-height:1;cursor:pointer;background:rgba(255,255,255,.92);border:1px solid #ccc;border-radius:3px;color:#c0392b;',
              onclick: function (e) { e.stopPropagation(); deleteBrowseImage(p); },
            }, '✕');
            browseGrid.appendChild(el('div', { style: 'position:relative;' }, [thumb, delBtn]));
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

    // ---------- 文件附件（非图片字段，如 Word / Markdown 附件） ----------
    var filePane = el('div', { style: 'display:none;' }, []);
    (function buildFilePane() {
      var fileInput2 = el('input', { type: 'file' });
      var fileFolder = el('input', { type: 'text', style: 'width:100%;padding:4px;box-sizing:border-box;' });
      folderInputs.push(fileFolder);
      var fileStatus = el('div', { style: 'margin-top:8px;font-size:12px;color:#666;min-height:16px;' });
      var fileBtn = el('button', { type: 'button', disabled: true, style: 'padding:6px 14px;cursor:pointer;' }, '请先选择文件');
      getRepoInfo().then(function (info) {
        if (!fileFolder.value) fileFolder.value = defaultFolder(info, currentValue);
      });
      fileInput2.addEventListener('change', function () {
        var f = fileInput2.files && fileInput2.files[0];
        fileBtn.disabled = !f;
        fileBtn.textContent = f ? '上传并插入' : '请先选择文件';
        fileStatus.style.color = '#666';
        fileStatus.textContent = f ? ('已选择：' + f.name + '（' + Math.round(f.size / 1024) + ' KB）') : '';
      });
      fileBtn.addEventListener('click', function () {
        var f = fileInput2.files && fileInput2.files[0];
        if (!f) return;
        var folder = (fileFolder.value || '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
        var filePath = (folder ? folder + '/' : '') + f.name;
        fileBtn.disabled = true;
        fileStatus.style.color = '#666';
        fileStatus.textContent = '正在上传…';
        uploadImage(filePath, f)
          .then(function () {
            fileStatus.textContent = '上传成功：' + filePath;
            if (handleInsertRef) handleInsertRef(filePath);
            setTimeout(closeModal, 500);
          })
          .catch(function (e) {
            fileBtn.disabled = false;
            fileBtn.textContent = '上传并插入';
            fileStatus.style.color = '#c0392b';
            fileStatus.textContent = '上传失败：' + (e && e.message ? e.message : '未知错误');
          });
      });
      filePane.appendChild(el('div', null, [
        el('label', { style: 'display:block;font-weight:600;margin-bottom:4px;' }, '选择文件（Word / Markdown / PDF 等）'),
        fileInput2,
        el('div', { style: 'margin:12px 0;' }, [
          el('label', { style: 'display:block;margin-bottom:3px;font-size:13px;' }, '保存到'),
          fileFolder,
        ]),
        el('div', { style: 'display:flex;gap:10px;align-items:center;' }, [fileBtn, el('button', { type: 'button', style: 'padding:6px 14px;cursor:pointer;', onclick: closeModal }, '取消')]),
        fileStatus,
      ]));
    })();

    // ---------- tabs ----------
    var uploadTab = el('button', { type: 'button', style: 'padding:6px 12px;cursor:pointer;font-weight:600;' }, '上传新图片');
    var browseTab = el('button', { type: 'button', style: 'padding:6px 12px;cursor:pointer;' }, '已有图片');
    var tabsRow = el('div', { style: 'display:flex;gap:8px;margin-bottom:14px;' }, [uploadTab, browseTab]);
    var activeTab = 'upload';

    function switchTab(which) {
      activeTab = which;
      applyMode();
    }
    uploadTab.addEventListener('click', function () { switchTab('upload'); });
    browseTab.addEventListener('click', function () { switchTab('browse'); });

    function applyMode() {
      if (isImageMode) {
        tabsRow.style.display = 'flex';
        filePane.style.display = 'none';
        var isUpload = activeTab === 'upload';
        uploadPane.style.display = isUpload ? 'block' : 'none';
        browsePane.style.display = isUpload ? 'none' : 'block';
        uploadTab.style.fontWeight = isUpload ? '600' : '400';
        browseTab.style.fontWeight = isUpload ? '400' : '600';
        if (!isUpload) loadBrowse();
      } else {
        tabsRow.style.display = 'none';
        uploadPane.style.display = 'none';
        browsePane.style.display = 'none';
        filePane.style.display = 'block';
      }
    }
    applyModeFn = applyMode;

    var box = el('div', { style: 'background:#fff;color:#333;border-radius:8px;padding:20px;width:640px;max-width:92vw;max-height:90vh;overflow:auto;box-sizing:border-box;' }, [
      tabsRow,
      uploadPane,
      browsePane,
      filePane,
    ]);

    modal = el('div', {
      style: 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:center;justify-content:center;z-index:99999;',
    }, [box]);

    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    document.body.appendChild(modal);
  }

  function openModal(params) {
    handleInsertRef = params.handleInsert;
    currentValue = params.value || null;
    currentMediaConfig = normalizeMediaConfig(params.config);
    isImageMode = params.imagesOnly === true;
    if (!modal) buildModal();
    folderInputs.forEach(function (inp) { inp.value = ''; });
    getRepoInfo().then(function (info) {
      var def = defaultFolder(info, currentValue);
      folderInputs.forEach(function (inp) { if (!inp.value) inp.value = def; });
    });
    if (applyModeFn) applyModeFn();
    if (applyMediaConfigFn) applyMediaConfigFn();
    modal.style.display = 'flex';
  }

  function closeModal() {
    if (modal) modal.style.display = 'none';
  }

  var mediaLibrary = {
    name: 'imagelib',
    init: function (args) {
      var insert = args && args.handleInsert;
      var globalConfig = normalizeMediaConfig(args && (args.config || args.options));
      return {
        show: function (p) {
          var fieldConfig = normalizeMediaConfig(p && p.config);
          openModal({
            value: p && p.value,
            imagesOnly: p && p.imagesOnly,
            config: Object.assign({}, globalConfig, fieldConfig),
            handleInsert: insert,
          });
        },
        hide: function () { closeModal(); },
        enableStandalone: function () { return false; },
      };
    },
  };

  CMS.registerMediaLibrary(mediaLibrary);
})();
