/* Vaporeasy — Catálogo ampliado de veículos via FIPE
   Atualização isolada: amplia marcas/modelos sem alterar clientes, agenda,
   recorrência, financeiro ou demais funções do aplicativo.
*/
(function () {
  'use strict';

  const V = 'v1';
  const CACHE_PREFIX = 'vaporeasy_fipe_catalog_' + V + '_';
  const CACHE_TTL = 35 * 24 * 60 * 60 * 1000; // 35 dias
  const V2 = 'https://fipe.parallelum.com.br/api/v2';
  const V1 = 'https://parallelum.com.br/fipe/api/v1';
  const originalPopulateModels = typeof window.populateModels === 'function'
    ? window.populateModels
    : null;

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function norm(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function displayBrandName(name) {
    const raw = String(name || '').trim();
    const k = norm(raw);
    const aliases = {
      'vw volkswagen': 'Volkswagen',
      'gm chevrolet': 'Chevrolet',
      'chevrolet': 'Chevrolet',
      'mercedes benz': 'Mercedes-Benz',
      'land rover': 'Land Rover',
      'caoa chery': 'CAOA Chery',
      'chery': 'Chery',
      'citroen': 'Citroën',
      'jac motors': 'JAC Motors',
      'great wall': 'GWM',
      'great wall motors': 'GWM'
    };
    return aliases[k] || raw;
  }

  function cacheRead(key) {
    try {
      const item = JSON.parse(localStorage.getItem(CACHE_PREFIX + key) || 'null');
      if (!item || !item.savedAt || Date.now() - item.savedAt > CACHE_TTL) return null;
      return item.data;
    } catch (_) {
      return null;
    }
  }

  function cacheWrite(key, data) {
    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({
        savedAt: Date.now(),
        data
      }));
    } catch (_) {}
  }

  async function fetchJson(url, timeoutMs = 9000) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller ? controller.signal : undefined,
        cache: 'no-store'
      });
      if (!res.ok) throw new Error('HTTP_' + res.status);
      return await res.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function parseBrands(payload) {
    const list = Array.isArray(payload) ? payload : [];
    return list.map(x => ({
      code: String(x.code ?? x.codigo ?? x.id ?? '').trim(),
      name: displayBrandName(x.name ?? x.nome ?? '')
    })).filter(x => x.code && x.name);
  }

  function parseModels(payload) {
    const source = Array.isArray(payload)
      ? payload
      : (Array.isArray(payload?.models) ? payload.models
      : (Array.isArray(payload?.modelos) ? payload.modelos : []));
    const seen = new Set();
    const out = [];
    source.forEach(x => {
      const name = String(x?.name ?? x?.nome ?? '').trim();
      if (!name) return;
      const key = norm(name);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(name);
    });
    return out.sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  }

  async function getBrands() {
    const cached = cacheRead('brands');
    if (Array.isArray(cached) && cached.length) return cached;

    let brands = [];
    try {
      brands = parseBrands(await fetchJson(V2 + '/cars/brands'));
    } catch (_) {
      try {
        brands = parseBrands(await fetchJson(V1 + '/carros/marcas'));
      } catch (_) {}
    }
    if (brands.length) cacheWrite('brands', brands);
    return brands;
  }

  async function getModels(brandCode) {
    const key = 'models_' + String(brandCode);
    const cached = cacheRead(key);
    if (Array.isArray(cached) && cached.length) return cached;

    let models = [];
    try {
      models = parseModels(await fetchJson(
        V2 + '/cars/brands/' + encodeURIComponent(brandCode) + '/models'
      ));
    } catch (_) {
      try {
        models = parseModels(await fetchJson(
          V1 + '/carros/marcas/' + encodeURIComponent(brandCode) + '/modelos'
        ));
      } catch (_) {}
    }
    if (models.length) cacheWrite(key, models);
    return models;
  }

  function currentBrandNames() {
    const names = [];
    ['cvMarca', 'rgMarca', 'quickVehicleBrand'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      [...el.options].forEach(o => {
        const v = String(o.value || '').trim();
        if (v && norm(v) !== 'outro') names.push(v);
      });
    });
    return [...new Set(names)];
  }

  function mergeBrands(apiBrands, existingNames) {
    const map = new Map();

    apiBrands.forEach(b => {
      const display = displayBrandName(b.name);
      const k = norm(display);
      if (!k) return;
      map.set(k, { code: b.code, name: display });
    });

    existingNames.forEach(name => {
      const display = displayBrandName(name);
      const k = norm(display);
      if (!k) return;
      if (!map.has(k)) map.set(k, { code: '', name: display });
    });

    return [...map.values()].sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
    );
  }

  function setBrandOptions(select, brands) {
    if (!select) return;
    const selected = select.value || select.dataset.vpSelectedBrand || '';
    const selectedKey = norm(displayBrandName(selected));

    select.innerHTML =
      '<option value="">Selecione a marca...</option>' +
      brands.map(b =>
        '<option value="' + esc(b.name) + '" data-fipe-code="' + esc(b.code) + '">' +
        esc(b.name) + '</option>'
      ).join('') +
      '<option value="Outro" data-fipe-code="">Outro</option>';

    if (selected) {
      const found = [...select.options].find(o =>
        norm(displayBrandName(o.value)) === selectedKey
      );
      if (found) select.value = found.value;
      else {
        const o = document.createElement('option');
        o.value = selected;
        o.textContent = selected;
        o.dataset.fipeCode = '';
        select.appendChild(o);
        select.value = selected;
      }
    }
  }

  async function refreshBrandSelects() {
    const targets = ['cvMarca', 'rgMarca', 'quickVehicleBrand']
      .map(id => document.getElementById(id))
      .filter(Boolean);

    if (!targets.length) return false;

    const existing = currentBrandNames();
    const apiBrands = await getBrands();
    if (!apiBrands.length) return false;

    const merged = mergeBrands(apiBrands, existing);
    targets.forEach(el => setBrandOptions(el, merged));
    return true;
  }

  function findBrandCode(select) {
    if (!select) return '';
    const opt = select.options[select.selectedIndex];
    return String(opt?.dataset?.fipeCode || '').trim();
  }

  function setModelOptions(modelEl, models, desired) {
    const before = String(desired || modelEl.value || '').trim();
    const beforeKey = norm(before);

    modelEl.innerHTML =
      '<option value="">Selecione o modelo...</option>' +
      models.map(m => '<option value="' + esc(m) + '">' + esc(m) + '</option>').join('') +
      '<option value="Outro">Outro</option>';

    if (before) {
      let found = [...modelEl.options].find(o => norm(o.value) === beforeKey);
      if (!found) {
        const o = document.createElement('option');
        o.value = before;
        o.textContent = before;
        modelEl.appendChild(o);
        found = o;
      }
      modelEl.value = found.value;
    }
  }

  async function fipePopulateModels(brandId, modelId, selected = '') {
    const brandEl = document.getElementById(brandId);
    const modelEl = document.getElementById(modelId);
    if (!brandEl || !modelEl) return;

    const brand = String(brandEl.value || '').trim();
    if (!brand) {
      modelEl.innerHTML = '<option value="">Selecione primeiro a marca...</option>';
      return;
    }

    if (norm(brand) === 'outro') {
      modelEl.innerHTML =
        '<option value="">Selecione o modelo...</option><option value="Outro">Outro</option>';
      if (selected) {
        const o = document.createElement('option');
        o.value = selected;
        o.textContent = selected;
        modelEl.appendChild(o);
        modelEl.value = selected;
      }
      return;
    }

    let code = findBrandCode(brandEl);

    // Se a marca veio de um veículo antigo/consulta de placa, tenta localizar seu código.
    if (!code) {
      const brands = await getBrands();
      const wanted = norm(displayBrandName(brand));
      const hit = brands.find(b => norm(displayBrandName(b.name)) === wanted);
      if (hit) {
        code = hit.code;
        const opt = brandEl.options[brandEl.selectedIndex];
        if (opt) opt.dataset.fipeCode = code;
      }
    }

    // Mostra feedback sem apagar imediatamente um modelo já selecionado.
    const initialDesired = String(selected || modelEl.value || '').trim();
    if (!initialDesired) {
      modelEl.innerHTML = '<option value="">Carregando modelos...</option>';
    }

    if (code) {
      const models = await getModels(code);
      if (models.length) {
        // Se outra rotina selecionou o modelo enquanto a consulta estava ocorrendo,
        // preserva essa seleção.
        const desiredNow = String(selected || modelEl.value || initialDesired || '').trim();
        setModelOptions(modelEl, models, desiredNow);
        return;
      }
    }

    // Segurança: se a FIPE estiver indisponível, usa o catálogo interno já existente.
    if (originalPopulateModels) {
      try {
        originalPopulateModels(brandId, modelId, selected || initialDesired);
        return;
      } catch (_) {}
    }

    modelEl.innerHTML =
      '<option value="">Selecione o modelo...</option><option value="Outro">Outro</option>';
  }

  // Substitui somente a função que monta os modelos. O restante do app não é alterado.
  window.populateModels = fipePopulateModels;

  async function boot() {
    try {
      await refreshBrandSelects();
    } catch (_) {}

    // Garante que cadastros rápidos criados/abertos depois também recebam a lista ampliada.
    const observer = new MutationObserver(() => {
      const quick = document.getElementById('quickVehicleBrand');
      const source = document.getElementById('cvMarca');
      if (quick && source && quick.options.length <= 1 && source.options.length > 1) {
        const current = quick.value;
        quick.innerHTML = source.innerHTML;
        if (current) quick.value = current;
      }
    });
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  }

  window.vpVehicleCatalogRefresh = async function () {
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith(CACHE_PREFIX))
        .forEach(k => localStorage.removeItem(k));
    } catch (_) {}
    return refreshBrandSelects();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0), { once: true });
  } else {
    setTimeout(boot, 0);
  }
})();
