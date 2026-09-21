/* Vaporeasy — correção do fluxo interno de Polimento técnico
   Objetivo:
   - Estética e pacotes continuam no fluxo normal de horários.
   - Polimento técnico vira solicitação interna para confirmação.
   - A solicitação reutiliza a infraestrutura existente de booking_requests.
*/
(function () {
  'use strict';

  const REQUEST_SERVICE_KEY = 'polimento tecnico';

  function norm(v) {
    try {
      if (typeof normalizeText === 'function') return normalizeText(v || '');
    } catch (_) {}
    return String(v || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  function isInternalRequestService() {
    return norm(document.getElementById('agendaServico')?.value || '') === REQUEST_SERVICE_KEY;
  }

  function requestStatus(message, ok) {
    const el = document.getElementById('agendaSaveStatus');
    if (!el) return;
    el.classList.remove('hidden');
    el.textContent = message;
    el.style.borderColor = ok ? 'rgba(54,211,153,.42)' : 'rgba(248,113,113,.42)';
    el.style.color = ok ? '#baf7dc' : '#fecaca';
  }

  function getRequestNotice() {
    let el = document.getElementById('agendaLongServiceRequestNotice');
    if (el) return el;

    const service = document.getElementById('agendaServico');
    if (!service) return null;

    el = document.createElement('div');
    el.id = 'agendaLongServiceRequestNotice';
    el.className = 'notice hidden';
    el.style.marginTop = '12px';
    el.style.marginBottom = '12px';
    el.style.borderLeft = '4px solid #19b7ed';
    el.innerHTML =
      '<b>Polimento técnico • confirmação manual</b><br>' +
      '<span>Escolha a data de preferência. A solicitação será registrada como pendente e não bloqueará a agenda até a Vaporeasy confirmar o atendimento.</span>';

    const hint = service.nextElementSibling;
    if (hint && hint.parentNode) hint.parentNode.insertBefore(el, hint.nextSibling);
    else service.parentNode?.insertBefore(el, service.nextSibling);

    return el;
  }

  function nearestLabelFor(el) {
    if (!el) return null;
    let p = el.previousElementSibling;
    while (p) {
      if (p.tagName === 'LABEL') return p;
      if (!p.classList?.contains('service-price-hint')) break;
      p = p.previousElementSibling;
    }
    return null;
  }

  function setBlockDisplay(el, hide) {
    if (!el) return;
    if (hide) {
      if (!el.dataset.vpOldDisplay) el.dataset.vpOldDisplay = el.style.display || '';
      el.style.display = 'none';
    } else {
      el.style.display = el.dataset.vpOldDisplay || '';
      delete el.dataset.vpOldDisplay;
    }
  }

  function updateInternalRequestMode() {
    const request = isInternalRequestService();
    const notice = getRequestNotice();
    notice?.classList.toggle('hidden', !request);

    const picker = document.querySelector('#appointmentFormCard .agenda-time-picker-block');
    const collaborator = document.getElementById('agendaColaborador');
    const collaboratorLabel = nearestLabelFor(collaborator);
    const travel = document.querySelector('#appointmentFormCard .travel-card');
    const frequency = document.getElementById('agendaFrequencia')?.closest('.item');
    const recurrence = document.getElementById('recurrenceOptions');
    const statusSelect = document.getElementById('agendaStatus');
    const statusLabel = nearestLabelFor(statusSelect);

    setBlockDisplay(picker, request);
    setBlockDisplay(collaborator, request);
    setBlockDisplay(collaboratorLabel, request);
    setBlockDisplay(travel, request);
    setBlockDisplay(frequency, request);
    setBlockDisplay(recurrence, request);
    setBlockDisplay(statusSelect, request);
    setBlockDisplay(statusLabel, request);

    const saveBtn = document.querySelector('#appointmentFormCard button[onclick="saveAppointment()"]');
    if (saveBtn) {
      saveBtn.textContent = request ? 'Solicitar confirmação' : 'Salvar agendamento';
    }

    if (request) {
      const hour = document.getElementById('agendaHora');
      if (hour) hour.value = '';
      const chips = document.getElementById('agendaAvailableTimeChips');
      if (chips) chips.innerHTML = '';
    } else {
      try { updateAvailableAppointmentTimes(); } catch (_) {}
    }
  }

  async function saveInternalBookingRequest() {
    const clientName = (document.getElementById('agendaCliente')?.value || '').trim();
    const plate = (document.getElementById('agendaVeiculo')?.value || '').trim();
    const date = document.getElementById('agendaData')?.value || '';
    const serviceName = document.getElementById('agendaServico')?.value || '';
    const notes = (document.getElementById('agendaObservacoes')?.value || '').trim();

    if (!clientName || !plate || !date || !serviceName) {
      requestStatus('Selecione cliente, veículo e data antes de solicitar a confirmação.', false);
      return;
    }

    let client = null;
    try {
      client = typeof getClientByName === 'function'
        ? getClientByName(clientName)
        : (typeof getClients === 'function'
            ? getClients().find(c => norm(c.name || '') === norm(clientName))
            : null);
    } catch (_) {}

    if (!client) {
      requestStatus('Não foi possível localizar o cadastro deste cliente.', false);
      return;
    }

    const phone = String(client.phone || client.telefone || '').trim();
    const condo = String(client.condo || client.condominium || client.condominio || '').trim();
    const address = String(client.address || client.endereco || '').trim();

    if (!phone) {
      requestStatus('Cadastre o telefone do cliente antes de criar a solicitação de Polimento.', false);
      return;
    }
    if (!condo && !address) {
      requestStatus('Cadastre o condomínio ou endereço do cliente antes de criar a solicitação de Polimento.', false);
      return;
    }

    let vehicle = null;
    try {
      vehicle = (typeof getVehicles === 'function' ? getVehicles() : []).find(v =>
        (typeof cleanPlate === 'function' ? cleanPlate(v.plate || '') : norm(v.plate || '')) ===
        (typeof cleanPlate === 'function' ? cleanPlate(plate) : norm(plate)) &&
        norm(v.client || '') === norm(clientName)
      );
    } catch (_) {}

    const vehicleLabel = vehicle
      ? [vehicle.brand, vehicle.model].filter(Boolean).join(' ').trim() || 'Veículo'
      : 'Veículo';

    const saveBtn = document.querySelector('#appointmentFormCard button[onclick="saveAppointment()"]');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Enviando solicitação…';
    }
    requestStatus('Registrando solicitação de Polimento…', true);

    try {
      if (typeof publicRpc !== 'function') {
        throw new Error('A conexão de agendamento não está disponível nesta versão.');
      }

      const services = await publicRpc('public_booking_services', {});
      const service = (Array.isArray(services) ? services : []).find(s => norm(s.name || '') === norm(serviceName));
      if (!service?.id) throw new Error('Serviço não encontrado na agenda online.');

      if (service.booking_mode !== 'request') {
        throw new Error('Este serviço não está configurado para confirmação manual.');
      }

      await publicRpc('public_create_booking_request_multi', {
        p_items: [{
          service_id: String(service.id),
          vehicle_label: vehicleLabel,
          plate: (typeof cleanPlate === 'function' ? cleanPlate(plate) : plate)
        }],
        p_preferred_date: date,
        p_alternate_date: null,
        p_client_name: clientName,
        p_phone: phone,
        p_condominium: condo || null,
        p_address: address || null,
        p_notes: notes || 'Solicitação criada pelo agendamento interno'
      });

      requestStatus('✅ Solicitação de Polimento registrada. Status: aguardando confirmação.', true);
      try {
        if (typeof loadBookingRequestsAdmin === 'function') loadBookingRequestsAdmin();
      } catch (_) {}
    } catch (e) {
      requestStatus(e?.message || String(e), false);
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Solicitar confirmação';
      }
    }
  }

  function install() {
    const service = document.getElementById('agendaServico');
    if (service && !service.dataset.vpRequestModeBound) {
      service.dataset.vpRequestModeBound = '1';
      service.addEventListener('change', () => setTimeout(updateInternalRequestMode, 0));
    }

    if (!window.__vpOriginalSaveAppointment && typeof window.saveAppointment === 'function') {
      window.__vpOriginalSaveAppointment = window.saveAppointment;
      window.saveAppointment = function () {
        if (isInternalRequestService()) return saveInternalBookingRequest();
        return window.__vpOriginalSaveAppointment.apply(this, arguments);
      };
    }

    updateInternalRequestMode();
  }

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(install, 50);
    setTimeout(install, 800);
    setTimeout(install, 1800);
  });

  window.addEventListener('load', () => setTimeout(install, 250));
  window.updateInternalRequestMode = updateInternalRequestMode;
})();
