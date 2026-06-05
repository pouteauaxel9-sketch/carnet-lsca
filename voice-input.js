/**
 * voice-input.js — Dictée vocale sur les champs texte
 *
 * Ajoute un bouton micro 🎤 à n'importe quel <input>/<textarea> qui porte
 * l'attribut data-voice (ou data-voice="fr-FR"). Au clic :
 *   - démarre la reconnaissance vocale (Web Speech API)
 *   - le texte est ajouté à la suite de la valeur courante
 *   - déclenche un événement 'input' pour que l'app détecte le changement
 *
 * Si l'API n'est pas dispo (Firefox, navigateurs anciens), le bouton est
 * masqué — pas de blocage.
 *
 * Utilisation :
 *   <textarea data-voice></textarea>             → bouton micro auto-ajouté
 *   <textarea data-voice="en-US"></textarea>     → langue spécifique
 *   VoiceInputModule.attach(element)             → attacher manuellement
 *
 * Expose : window.VoiceInputModule.{ attach, attachAll, isSupported }
 */
(function () {
  'use strict';

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const SUPPORTED = !!SpeechRecognition;
  const DEFAULT_LANG = 'fr-FR';

  let activeRec = null;
  let activeBtn = null;

  function isSupported() { return SUPPORTED; }

  /* ── création du bouton ─────────────────────────────────── */

  function makeButton(input, lang) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'voice-btn';
    btn.setAttribute('aria-label', 'Dicter à la voix');
    btn.title = 'Dicter (cliquer puis parler)';
    btn.innerHTML = '🎤';
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      if (activeRec) {
        stopRecording();
        return;
      }
      startRecording(input, btn, lang);
    });
    return btn;
  }

  function startRecording(input, btn, lang) {
    if (!SUPPORTED) return;
    const rec = new SpeechRecognition();
    rec.lang = lang || DEFAULT_LANG;
    rec.continuous = false;
    rec.interimResults = true;

    let baseValue = input.value || '';
    let finalText = '';

    rec.onresult = ev => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const tr = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) finalText += tr;
        else interim += tr;
      }
      const sep = baseValue && !baseValue.endsWith(' ') ? ' ' : '';
      input.value = baseValue + sep + finalText + interim;
      // notifier l'app
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };

    rec.onend = () => {
      if (finalText) {
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      cleanup();
    };

    rec.onerror = ev => {
      console.warn('voice rec error', ev.error);
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        window.appUtils?.showToast?.('Micro non autorisé — vérifie les permissions');
      } else if (ev.error === 'no-speech') {
        window.appUtils?.showToast?.('Aucune voix détectée');
      } else {
        window.appUtils?.showToast?.('Erreur micro : ' + ev.error);
      }
      cleanup();
    };

    try {
      rec.start();
      btn.classList.add('is-recording');
      btn.innerHTML = '🛑';
      btn.title = 'Arrêter la dictée';
      activeRec = rec;
      activeBtn = btn;
      window.appUtils?.showToast?.('🎤 Parle maintenant…');
    } catch (err) {
      console.warn('voice start failed', err);
      cleanup();
    }
  }

  function stopRecording() {
    if (activeRec) {
      try { activeRec.stop(); } catch {}
    }
    cleanup();
  }

  function cleanup() {
    if (activeBtn) {
      activeBtn.classList.remove('is-recording');
      activeBtn.innerHTML = '🎤';
      activeBtn.title = 'Dicter (cliquer puis parler)';
    }
    activeRec = null;
    activeBtn = null;
  }

  /* ── attachement DOM ───────────────────────────────────── */

  function attach(input) {
    if (!input || !SUPPORTED) return;
    if (input.dataset.voiceAttached === '1') return;
    input.dataset.voiceAttached = '1';
    const lang = input.dataset.voice || input.dataset.voiceLang || DEFAULT_LANG;

    // Wrap dans un conteneur si pas déjà fait
    let wrap = input.parentElement;
    if (!wrap || !wrap.classList.contains('voice-wrap')) {
      wrap = document.createElement('span');
      wrap.className = 'voice-wrap';
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
    }
    const btn = makeButton(input, lang);
    wrap.appendChild(btn);
  }

  function attachAll(root) {
    if (!SUPPORTED) return;
    const scope = root || document;
    scope.querySelectorAll('[data-voice], [data-voice-lang]').forEach(attach);
  }

  // Observer pour les éléments créés dynamiquement
  function observe() {
    if (!SUPPORTED) return;
    const obs = new MutationObserver(mutations => {
      let needsScan = false;
      for (const m of mutations) {
        if (m.addedNodes.length) { needsScan = true; break; }
      }
      if (needsScan) attachAll();
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  // Bootstrap auto
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        attachAll();
        observe();
      });
    } else {
      attachAll();
      observe();
    }
  }

  window.VoiceInputModule = { attach, attachAll, isSupported };
})();
