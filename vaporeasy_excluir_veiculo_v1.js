/* Vaporeasy — botão Excluir veículo (exclusão segura)
   Backend esperado: vaporeasy-bridge-auth action=vehicle_delete
*/
(function () {
  'use strict';

  function clean(v) {
    try {
      if (typeof cleanPlate === 'function') return cleanPlate(v || '');
    } catch (_) {}
    return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
  }

  function currentRole() {
    try {
      return window.vpGetCurrentProfile?.()?.role || '';
    } catch (_) {
      return '';
    }
  }

  function canDeleteVehicle() {
    return ['owner', 'admin'].includes(currentRole());
  }

  function toast(message, type) {
    try {
      if (typeof showToast === 'function') {
        showToast(message, type || 'success');
        return;
      }
    } catch (_) {}
    alert(message);
  }

  window.vpDeleteVehicleFromCadastro = async function (plateInput) {
    const plate = clean(plateInput);
    if (!plate) {
      toast('Placa do veículo não encontrada.', 'error');
      return;
    }

    if (!canDeleteVehicle()) {
      toast('Somente proprietário ou administrador pode excluir veículos.', 'error');
      return;
    }

    const vehicles = typeof getVehicles === 'function' ? getVehicles() : [];
    const vehicle = vehicles.find(v => clean(v.plate) === plate);

    if (!vehicle) {
      toast('Veículo não encontrado.', 'error');
      return;
    }

    const label = [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'Veículo';

    const confirmed = confirm(
      'Excluir ' + label + ' • ' + plate + '?\n\n' +
      'O veículo sairá do cadastro e dos novos agendamentos. ' +
      'Serviços já concluídos e o histórico financeiro serão preservados.'
    );
    if (!confirmed) return;

    try {
      if (vehicle.cloudId && typeof window.vpSecureBridge !== 'function') {
        throw new Error('Atualização segura indisponível. Atualize o aplicativo e tente novamente.');
      }

      if (typeof window.vpSecureBridge === 'function') {
        try {
          const result = await window.vpSecureBridge('vehicle_delete', {
            method: 'POST',
            body: {
              vehicle_id: vehicle.cloudId || '',
              plate: plate
            }
          });

          if (result?.ok === false) {
            throw new Error(result.error || 'Não foi possível excluir o veículo.');
          }
        } catch (e) {
          // Veículo criado somente neste aparelho pode ainda não existir na nuvem.
          if (vehicle.cloudId || String(e?.message || e) !== 'vehicle_not_found') throw e;
        }
      }

      const key = typeof STORAGE_VEHICLES !== 'undefined'
        ? STORAGE_VEHICLES
        : 'vaporeasy_vehicles_v1';

      let local = [];
      try {
        local = JSON.parse(localStorage.getItem(key) || '[]');
        if (!Array.isArray(local)) local = [];
      } catch (_) {
        local = [];
      }

      local = local.filter(v => clean(v.plate) !== plate);

      // Grava diretamente para evitar uma sincronização concorrente antes do
      // servidor terminar de arquivar o veículo.
      localStorage.setItem(key, JSON.stringify(local));

      if (typeof window.vpSecurePullNow === 'function') {
        try { await window.vpSecurePullNow(false); } catch (_) {}
      }

      try { if (typeof updatePlateSuggestions === 'function') updatePlateSuggestions(); } catch (_) {}
      try { if (typeof updateAgendaVehicles === 'function') updateAgendaVehicles(); } catch (_) {}

      const selected =
        document.getElementById('clienteSelecionado')?.value ||
        vehicle.client ||
        '';

      try {
        if (selected && typeof renderClientVehicles === 'function') {
          renderClientVehicles(selected);
        }
      } catch (_) {}

      try {
        if (typeof window.vpPopulateBookingClients === 'function') {
          window.vpPopulateBookingClients();
        }
      } catch (_) {}

      toast('Veículo excluído do cadastro. Histórico concluído preservado.', 'success');
    } catch (e) {
      toast(e?.message || String(e), 'error');
    }
  };

  function installButtons() {
    if (!canDeleteVehicle()) return;

    const list = document.getElementById('clientVehiclesList');
    if (!list) return;

    list.querySelectorAll('.item').forEach(card => {
      if (card.querySelector('.vp-delete-vehicle-btn')) return;

      const tag = card.querySelector('.tag');
      const actions = card.querySelector('.actions');
      if (!tag || !actions) return;

      const plate = clean(tag.textContent || '');
      if (plate.length < 7) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-red vp-delete-vehicle-btn';
      btn.textContent = 'Excluir veículo';
      btn.addEventListener('click', function () {
        window.vpDeleteVehicleFromCadastro(plate);
      });
      actions.appendChild(btn);
    });
  }

  function bind() {
    const list = document.getElementById('clientVehiclesList');
    if (list && !list.dataset.vpDeleteVehicleObserver) {
      list.dataset.vpDeleteVehicleObserver = '1';
      const observer = new MutationObserver(installButtons);
      observer.observe(list, { childList: true, subtree: true });
    }

    installButtons();

    // Reaplica quando o usuário volta ao app ou o perfil termina de carregar.
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') installButtons();
    });

    setTimeout(installButtons, 500);
    setTimeout(installButtons, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
