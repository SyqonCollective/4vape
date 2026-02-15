import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";

const DEFAULT_CAMPAIGN_FORM = {
  id: "",
  name: "",
  subject: "",
  html: "",
  templateId: "",
  listId: "",
  groupId: "",
  audienceType: "ALL_ACTIVE",
  audienceCompanyIds: [],
  scheduledAt: "",
};

const DEFAULT_TEMPLATE_FORM = {
  id: "",
  name: "",
  subject: "",
  html: "",
  active: true,
};

function parseApiError(err, fallback) {
  const raw = err?.message || "";
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error) return parsed.error;
    return fallback;
  } catch {
    return raw || fallback;
  }
}

function campaignStatusLabel(status) {
  switch (status) {
    case "SENT":
      return "Inviata";
    case "FAILED":
      return "Errore";
    case "SCHEDULED":
      return "Programm.";
    default:
      return "Bozza";
  }
}

function RichTextEditor({ value, onChange, placeholder = "Scrivi contenuto email..." }) {
  const editorRef = useRef(null);
  const imageInputRef = useRef(null);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if ((value || "") !== el.innerHTML) {
      el.innerHTML = value || "";
    }
  }, [value]);

  function run(command, arg) {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand(command, false, arg);
    onChange(el.innerHTML);
  }

  function onInput() {
    const el = editorRef.current;
    if (!el) return;
    onChange(el.innerHTML);
  }

  function addLink() {
    const url = window.prompt("Inserisci URL (https://...)");
    if (!url) return;
    run("createLink", url.trim());
  }

  function addImageByUrl() {
    const url = window.prompt("Inserisci URL immagine");
    if (!url) return;
    run("insertImage", url.trim());
  }

  function addImageFromFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (!dataUrl) return;
      run("insertImage", dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  return (
    <div className="rte">
      <div className="rte-toolbar">
        <button type="button" className="rte-btn" onClick={() => run("bold")} title="Grassetto">
          B
        </button>
        <button type="button" className="rte-btn" onClick={() => run("italic")} title="Corsivo">
          I
        </button>
        <button type="button" className="rte-btn" onClick={() => run("underline")} title="Sottolineato">
          U
        </button>
        <button type="button" className="rte-btn" onClick={() => run("formatBlock", "<h2>")} title="Titolo">
          H2
        </button>
        <button type="button" className="rte-btn" onClick={() => run("insertUnorderedList")} title="Elenco puntato">
          • List
        </button>
        <button type="button" className="rte-btn" onClick={() => run("insertOrderedList")} title="Elenco numerato">
          1. List
        </button>
        <button type="button" className="rte-btn" onClick={() => run("justifyLeft")} title="Allinea a sinistra">
          Left
        </button>
        <button type="button" className="rte-btn" onClick={() => run("justifyCenter")} title="Centra">
          Center
        </button>
        <button type="button" className="rte-btn" onClick={addLink} title="Aggiungi link">
          Link
        </button>
        <button type="button" className="rte-btn" onClick={addImageByUrl} title="Immagine da URL">
          Img URL
        </button>
        <button type="button" className="rte-btn" onClick={() => imageInputRef.current?.click()} title="Carica immagine">
          Upload Img
        </button>
        <button type="button" className="rte-btn" onClick={() => run("removeFormat")} title="Rimuovi formattazione">
          Clear
        </button>
      </div>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={addImageFromFile}
      />
      <div
        ref={editorRef}
        className="rte-editor"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={onInput}
      />
    </div>
  );
}

export default function AdminMailMarketing() {
  const [error, setError] = useState("");
  const [status, setStatus] = useState({ configured: false, wsUsername: null });
  const [lists, setLists] = useState([]);
  const [groups, setGroups] = useState([]);
  const [fields, setFields] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [sendingCampaignId, setSendingCampaignId] = useState("");
  const [testResult, setTestResult] = useState("");
  const [syncSummary, setSyncSummary] = useState(null);
  const [selectedListId, setSelectedListId] = useState(1);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [templateForm, setTemplateForm] = useState(DEFAULT_TEMPLATE_FORM);
  const [campaignForm, setCampaignForm] = useState(DEFAULT_CAMPAIGN_FORM);
  const [companySearch, setCompanySearch] = useState("");
  const [previewCampaign, setPreviewCampaign] = useState(null);
  const [previewHistoryMail, setPreviewHistoryMail] = useState(null);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [mailupHistory, setMailupHistory] = useState([]);

  const filteredCompanies = useMemo(() => {
    const active = companies.filter((c) => c.status === "ACTIVE" && c.email);
    if (!companySearch.trim()) return active;
    const query = companySearch.trim().toLowerCase();
    return active.filter((c) =>
      [c.name, c.legalName, c.email, c.vatNumber, c.customerCode]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [companies, companySearch]);

  async function loadGroups(listId) {
    if (!listId) {
      setGroups([]);
      return;
    }
    try {
      const groupsRes = await api(`/admin/mail-marketing/groups?listId=${listId}`);
      setGroups(groupsRes?.items || []);
    } catch {
      setGroups([]);
    }
  }

  async function loadAll() {
    setError("");
    try {
      const [statusRes, metaRes, listRes, fieldRes, companyRes, templateRes, campaignRes] =
        await Promise.all([
          api("/admin/mail-marketing/status"),
          api("/admin/mail-marketing/meta"),
          api("/admin/mail-marketing/lists"),
          api("/admin/mail-marketing/fields"),
          api("/admin/companies"),
          api("/admin/mail-marketing/templates"),
          api("/admin/mail-marketing/campaigns"),
        ]);
      setStatus(statusRes || { configured: false, wsUsername: null });
      const mergedLists = (listRes?.items || []).length ? listRes.items : metaRes?.lists || [];
      setLists(mergedLists);
      setFields((fieldRes?.items || []).length ? fieldRes.items : metaRes?.fields || []);
      setCompanies(companyRes || []);
      setTemplates(templateRes || []);
      setCampaigns(campaignRes || []);

      const nextListId = Number(
        campaignForm.listId || selectedListId || mergedLists?.[0]?.id || mergedLists?.[0]?.IdList || 1
      );
      setSelectedListId(nextListId);
      if (!campaignForm.listId) {
        setCampaignForm((prev) => ({ ...prev, listId: String(nextListId) }));
      }
      await loadGroups(nextListId);
      try {
        const historyRes = await api(`/admin/mail-marketing/history?listId=${nextListId}`);
        setMailupHistory(historyRes?.items || []);
      } catch {
        setMailupHistory([]);
      }
    } catch {
      setError("Impossibile caricare Mail Marketing");
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestResult("");
    try {
      const res = await api("/admin/mail-marketing/test", { method: "POST" });
      setTestResult(res?.ok ? "Connessione MailUp OK" : "Connessione non valida");
    } catch (err) {
      setTestResult(parseApiError(err, "Connessione non valida"));
    } finally {
      setTesting(false);
    }
  }

  async function syncCompanies() {
    setSyncing(true);
    setError("");
    setSyncSummary(null);
    try {
      const res = await api("/admin/mail-marketing/sync/companies", {
        method: "POST",
        body: JSON.stringify({
          listId: Number(selectedListId),
          groupId: selectedGroupId ? Number(selectedGroupId) : undefined,
        }),
      });
      setSyncSummary(res);
    } catch (err) {
      setError(parseApiError(err, "Errore sincronizzazione aziende su MailUp"));
    } finally {
      setSyncing(false);
    }
  }

  async function saveTemplate(e) {
    e.preventDefault();
    if (!templateForm.name || !templateForm.subject || !templateForm.html) {
      setError("Compila nome, oggetto e contenuto template");
      return;
    }
    setSavingTemplate(true);
    setError("");
    try {
      const payload = {
        name: templateForm.name.trim(),
        subject: templateForm.subject.trim(),
        html: templateForm.html,
        active: Boolean(templateForm.active),
      };
      if (templateForm.id) {
        await api(`/admin/mail-marketing/templates/${templateForm.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/admin/mail-marketing/templates", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setTemplateForm(DEFAULT_TEMPLATE_FORM);
      await loadAll();
    } catch (err) {
      setError(parseApiError(err, "Errore salvataggio template"));
    } finally {
      setSavingTemplate(false);
    }
  }

  async function deleteTemplate(id) {
    if (!window.confirm("Eliminare template?")) return;
    try {
      await api(`/admin/mail-marketing/templates/${id}`, { method: "DELETE" });
      if (templateForm.id === id) setTemplateForm(DEFAULT_TEMPLATE_FORM);
      await loadAll();
    } catch (err) {
      setError(parseApiError(err, "Impossibile eliminare template"));
    }
  }

  async function saveCampaign(e) {
    e.preventDefault();
    if (!campaignForm.name || !campaignForm.subject || !campaignForm.html || !campaignForm.listId) {
      setError("Compila nome, oggetto, contenuto e lista");
      return;
    }
    if (campaignForm.audienceType === "SELECTED_COMPANIES" && !campaignForm.audienceCompanyIds.length) {
      setError("Seleziona almeno un'azienda per il pubblico selezionato");
      return;
    }
    setSavingCampaign(true);
    setError("");
    try {
      const payload = {
        name: campaignForm.name.trim(),
        subject: campaignForm.subject.trim(),
        html: campaignForm.html,
        templateId: campaignForm.templateId || undefined,
        listId: Number(campaignForm.listId),
        groupId: campaignForm.groupId ? Number(campaignForm.groupId) : undefined,
        audienceType: campaignForm.audienceType,
        audienceCompanyIds:
          campaignForm.audienceType === "SELECTED_COMPANIES" ? campaignForm.audienceCompanyIds : [],
        scheduledAt: campaignForm.scheduledAt || undefined,
      };
      if (campaignForm.id) {
        await api(`/admin/mail-marketing/campaigns/${campaignForm.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            ...payload,
            groupId: campaignForm.groupId ? Number(campaignForm.groupId) : null,
            scheduledAt: campaignForm.scheduledAt || null,
          }),
        });
      } else {
        await api("/admin/mail-marketing/campaigns", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setCampaignForm((prev) => ({ ...DEFAULT_CAMPAIGN_FORM, listId: prev.listId }));
      await loadAll();
    } catch (err) {
      setError(parseApiError(err, "Errore salvataggio campagna"));
    } finally {
      setSavingCampaign(false);
    }
  }

  async function deleteCampaign(id) {
    if (!window.confirm("Eliminare campagna?")) return;
    try {
      await api(`/admin/mail-marketing/campaigns/${id}`, { method: "DELETE" });
      if (campaignForm.id === id) {
        setCampaignForm((prev) => ({ ...DEFAULT_CAMPAIGN_FORM, listId: prev.listId }));
      }
      await loadAll();
    } catch (err) {
      setError(parseApiError(err, "Impossibile eliminare campagna"));
    }
  }

  async function sendCampaignNow(campaignId) {
    if (!window.confirm("Inviare ora questa campagna?")) return;
    setSendingCampaignId(campaignId);
    setError("");
    try {
      await api(`/admin/mail-marketing/campaigns/${campaignId}/send`, { method: "POST" });
      await loadAll();
    } catch (err) {
      setError(parseApiError(err, "Invio campagna fallito"));
    } finally {
      setSendingCampaignId("");
    }
  }

  async function duplicateTemplate(template) {
    try {
      await api("/admin/mail-marketing/templates", {
        method: "POST",
        body: JSON.stringify({
          name: `${template.name} (copia)`,
          subject: template.subject,
          html: template.html,
          active: Boolean(template.active),
        }),
      });
      await loadAll();
    } catch (err) {
      setError(parseApiError(err, "Duplicazione template fallita"));
    }
  }

  async function duplicateCampaign(campaign) {
    try {
      await api("/admin/mail-marketing/campaigns", {
        method: "POST",
        body: JSON.stringify({
          name: `${campaign.name} (copia)`,
          subject: campaign.subject,
          html: campaign.html,
          templateId: campaign.templateId || undefined,
          listId: Number(campaign.listId),
          groupId: campaign.groupId || undefined,
          audienceType: campaign.audienceType || "ALL_ACTIVE",
          audienceCompanyIds: Array.isArray(campaign.audienceCompanyIds) ? campaign.audienceCompanyIds : [],
        }),
      });
      await loadAll();
    } catch (err) {
      setError(parseApiError(err, "Duplicazione campagna fallita"));
    }
  }

  async function openHistoryMail(item) {
    const rawId = item?.Id || item?.id || item?.EmailID || item?.MessageID || item?.MessageId || null;
    const emailId = Number(rawId);
    const fallbackHtml = item?.ContentHTML || item?.HtmlBody || item?.Body || item?.Content || "";
    const fallbackSubject = item?.Subject || item?.subject || "-";
    const fallbackName = item?.Name || item?.name || (rawId ? `Mail ${rawId}` : "Mail storica");
    try {
      if (!emailId) {
        setPreviewHistoryMail({
          id: rawId || "-",
          subject: fallbackSubject,
          name: fallbackName,
          html: fallbackHtml,
          raw: item,
        });
        return;
      }
      const res = await api(`/admin/mail-marketing/history/${emailId}?listId=${selectedListId}`);
      const detail = res?.item || null;
      const html =
        detail?.ContentHTML ||
        detail?.HtmlBody ||
        detail?.Body ||
        detail?.Content ||
        fallbackHtml ||
        "";
      const subject = detail?.Subject || detail?.subject || fallbackSubject;
      const name = detail?.Name || detail?.name || fallbackName;
      setPreviewHistoryMail({ id: emailId, subject, name, html, raw: detail || item });
    } catch (err) {
      setPreviewHistoryMail({
        id: rawId || "-",
        subject: fallbackSubject,
        name: fallbackName,
        html: fallbackHtml,
        raw: item,
      });
    }
  }

  async function duplicateFromHistory(item) {
    const rawId = item?.Id || item?.id || item?.EmailID || item?.MessageID || item?.MessageId || null;
    const emailId = Number(rawId);
    const fallbackHtml = item?.ContentHTML || item?.HtmlBody || item?.Body || item?.Content || "";
    const fallbackSubject = item?.Subject || item?.subject || "";
    const fallbackName = item?.Name || item?.name || (rawId ? `Mail ${rawId}` : "Mail storica");
    try {
      let detail = {};
      if (emailId) {
        const res = await api(`/admin/mail-marketing/history/${emailId}?listId=${selectedListId}`);
        detail = res?.item || {};
      }
      const html =
        detail?.ContentHTML ||
        detail?.HtmlBody ||
        detail?.Body ||
        detail?.Content ||
        fallbackHtml ||
        "";
      const subject = detail?.Subject || detail?.subject || fallbackSubject;
      const name = detail?.Name || detail?.name || fallbackName;
      setCampaignForm((prev) => ({
        ...prev,
        id: "",
        name: `${name} (copia)`,
        subject: subject || prev.subject,
        html: html || prev.html,
        listId: String(selectedListId || prev.listId || 1),
      }));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setCampaignForm((prev) => ({
        ...prev,
        id: "",
        name: `${fallbackName} (copia)`,
        subject: fallbackSubject || prev.subject,
        html: fallbackHtml || prev.html,
        listId: String(selectedListId || prev.listId || 1),
      }));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function loadTemplateIntoForm(template) {
    setTemplateForm({
      id: template.id,
      name: template.name || "",
      subject: template.subject || "",
      html: template.html || "",
      active: Boolean(template.active),
    });
  }

  function loadCampaignIntoForm(campaign) {
    const ids = Array.isArray(campaign.audienceCompanyIds) ? campaign.audienceCompanyIds : [];
    const listId = String(campaign.listId || selectedListId || 1);
    setCampaignForm({
      id: campaign.id,
      name: campaign.name || "",
      subject: campaign.subject || "",
      html: campaign.html || "",
      templateId: campaign.templateId || "",
      listId,
      groupId: campaign.groupId ? String(campaign.groupId) : "",
      audienceType: campaign.audienceType || "ALL_ACTIVE",
      audienceCompanyIds: ids,
      scheduledAt: campaign.scheduledAt ? new Date(campaign.scheduledAt).toISOString().slice(0, 16) : "",
    });
    setSelectedListId(Number(listId));
    loadGroups(Number(listId));
  }

  function applyTemplateToCampaign(templateId) {
    const template = templates.find((t) => t.id === templateId);
    setCampaignForm((prev) => ({
      ...prev,
      templateId,
      subject: template?.subject || prev.subject,
      html: template?.html || prev.html,
      name: template && !prev.name ? template.name : prev.name,
    }));
  }

  function toggleCompanyTarget(companyId) {
    setCampaignForm((prev) => {
      const has = prev.audienceCompanyIds.includes(companyId);
      return {
        ...prev,
        audienceCompanyIds: has
          ? prev.audienceCompanyIds.filter((id) => id !== companyId)
          : [...prev.audienceCompanyIds, companyId],
      };
    });
  }

  useEffect(() => {
    loadAll();
  }, []);

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Mail Marketing</h1>
          <p>Crea template, gestisci pubblico, invia e traccia campagne MailUp</p>
        </div>
      </div>

      <InlineError message={error} onClose={() => setError("")} />

      <div className="panel">
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <div className="muted">
            Stato integrazione:{" "}
            <strong style={{ color: status.configured ? "#15803d" : "#dc2626" }}>
              {status.configured ? "Configurata" : "Non configurata"}
            </strong>
            {status.wsUsername ? ` · WS: ${status.wsUsername}` : ""}
          </div>
          <div className="actions">
            <button className="btn ghost" onClick={loadAll}>Ricarica</button>
            <button className="btn ghost" onClick={testConnection} disabled={testing}>
              {testing ? "Test in corso..." : "Test connessione"}
            </button>
          </div>
        </div>
        {testResult ? <div className="muted" style={{ marginTop: 8 }}>{testResult}</div> : null}
      </div>

      <div className="panel mail-marketing-layout">
        <div>
          <h2>Template email</h2>
          <form className="mail-form" onSubmit={saveTemplate}>
            <div className="form-grid">
              <label>
                Nome template
                <input
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Promo primavera B2B"
                />
              </label>
              <label>
                Oggetto
                <input
                  value={templateForm.subject}
                  onChange={(e) => setTemplateForm((prev) => ({ ...prev, subject: e.target.value }))}
                  placeholder="Nuove promo disponibili"
                />
              </label>
            </div>
            <label>
              Contenuto email (editor visuale)
              <RichTextEditor
                value={templateForm.html}
                onChange={(next) => setTemplateForm((prev) => ({ ...prev, html: next }))}
                placeholder="Scrivi il contenuto della newsletter..."
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={templateForm.active}
                onChange={(e) => setTemplateForm((prev) => ({ ...prev, active: e.target.checked }))}
              />
              Template attivo
            </label>
            <div className="actions">
              {templateForm.id ? (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setTemplateForm(DEFAULT_TEMPLATE_FORM)}
                >
                  Nuovo template
                </button>
              ) : null}
              <button type="submit" className="btn primary" disabled={savingTemplate}>
                {savingTemplate ? "Salvataggio..." : templateForm.id ? "Salva modifiche" : "Crea template"}
              </button>
            </div>
          </form>

          <div className="table compact mail-template-table" style={{ marginTop: 12 }}>
            <div className="row header"><div>Nome</div><div>Oggetto</div><div>Azioni</div></div>
            {templates.map((t) => (
              <div className="row" key={t.id}>
                <div>{t.name}</div>
                <div>{t.subject}</div>
                <div className="actions">
                  <button type="button" className="btn ghost" onClick={() => loadTemplateIntoForm(t)}>Modifica</button>
                  <button type="button" className="btn ghost" onClick={() => duplicateTemplate(t)}>Duplica</button>
                  <button type="button" className="btn ghost danger" onClick={() => deleteTemplate(t.id)}>Elimina</button>
                </div>
              </div>
            ))}
            {!templates.length ? <div className="row"><div className="muted">Nessun template</div></div> : null}
          </div>
        </div>

        <div>
          <h2>Sincronizzazione pubblico</h2>
          <div className="form-grid">
            <label>
              Lista MailUp
              <select
                className="select"
                value={selectedListId}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setSelectedListId(next);
                  loadGroups(next);
                  api(`/admin/mail-marketing/history?listId=${next}`)
                    .then((r) => setMailupHistory(r?.items || []))
                    .catch(() => setMailupHistory([]));
                }}
              >
                {lists.map((l) => (
                  <option key={l.id || l.IdList} value={l.id || l.IdList}>
                    {(l.id || l.IdList)} · {l.name || l.Name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Gruppo MailUp
              <select className="select" value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)}>
                <option value="">Nessuno</option>
                {groups.map((g, i) => (
                  <option key={`${g.groupId || g.IdGroup || i}`} value={g.groupId || g.IdGroup}>
                    {(g.groupId || g.IdGroup)} · {g.name || g.Name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Aziende attive con email
              <input value={companies.filter((c) => c.status === "ACTIVE" && c.email).length} disabled />
            </label>
          </div>
          <div className="actions" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={syncCompanies} disabled={syncing || !selectedListId}>
              {syncing ? "Sincronizzazione..." : "Sincronizza ora"}
            </button>
          </div>
          {syncSummary ? (
            <div className="table compact" style={{ marginTop: 12 }}>
              <div className="row header"><div>Totale</div><div>OK</div><div>Errori</div></div>
              <div className="row"><div>{syncSummary.total}</div><div>{syncSummary.ok}</div><div>{syncSummary.failed}</div></div>
            </div>
          ) : null}

          <div className="actions" style={{ marginTop: 16, justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>Campi anagrafica</h2>
            <button type="button" className="btn ghost" onClick={() => setFieldsOpen((v) => !v)}>
              {fieldsOpen ? "Chiudi campi" : "Apri campi"}
            </button>
          </div>
          {fieldsOpen ? (
            <div className="table compact" style={{ marginTop: 10 }}>
              <div className="row header"><div>ID campo</div><div>Nome</div></div>
              {fields.map((f) => (
                <div className="row" key={f.id || f.Id}>
                  <div className="mono">{f.id || f.Id}</div>
                  <div>{f.name || f.Name}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted" style={{ marginTop: 8 }}>
              Clicca su "Apri campi" per vedere tutti i campi anagrafica.
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <h2>Campagne</h2>
        <form className="mail-form" onSubmit={saveCampaign}>
          <div className="form-grid">
            <label>
              Nome campagna
              <input
                value={campaignForm.name}
                onChange={(e) => setCampaignForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Newsletter febbraio"
              />
            </label>
            <label>
              Oggetto
              <input
                value={campaignForm.subject}
                onChange={(e) => setCampaignForm((prev) => ({ ...prev, subject: e.target.value }))}
                placeholder="Offerte dedicate"
              />
            </label>
            <label>
              Template
              <select
                className="select"
                value={campaignForm.templateId}
                onChange={(e) => applyTemplateToCampaign(e.target.value)}
              >
                <option value="">Nessuno</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Lista MailUp
              <select
                className="select"
                value={campaignForm.listId}
                onChange={(e) => {
                  const listId = e.target.value;
                  setCampaignForm((prev) => ({ ...prev, listId, groupId: "" }));
                  setSelectedListId(Number(listId));
                  loadGroups(Number(listId));
                }}
              >
                {lists.map((l) => (
                  <option key={l.id || l.IdList} value={l.id || l.IdList}>
                    {(l.id || l.IdList)} · {l.name || l.Name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Gruppo MailUp
              <select
                className="select"
                value={campaignForm.groupId}
                onChange={(e) => setCampaignForm((prev) => ({ ...prev, groupId: e.target.value }))}
              >
                <option value="">Nessuno</option>
                {groups.map((g, i) => (
                  <option key={`${g.groupId || g.IdGroup || i}`} value={g.groupId || g.IdGroup}>
                    {(g.groupId || g.IdGroup)} · {g.name || g.Name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Programmazione
              <input
                type="datetime-local"
                value={campaignForm.scheduledAt}
                onChange={(e) => setCampaignForm((prev) => ({ ...prev, scheduledAt: e.target.value }))}
              />
            </label>
          </div>

          <label>
            Contenuto email (editor visuale)
            <RichTextEditor
              value={campaignForm.html}
              onChange={(next) => setCampaignForm((prev) => ({ ...prev, html: next }))}
              placeholder="Scrivi la campagna..."
            />
          </label>

          <div className="mail-audience-head">
            <label className="checkbox-row">
              <input
                type="radio"
                name="audienceType"
                checked={campaignForm.audienceType === "ALL_ACTIVE"}
                onChange={() => setCampaignForm((prev) => ({ ...prev, audienceType: "ALL_ACTIVE" }))}
              />
              Tutte le aziende attive
            </label>
            <label className="checkbox-row">
              <input
                type="radio"
                name="audienceType"
                checked={campaignForm.audienceType === "SELECTED_COMPANIES"}
                onChange={() => setCampaignForm((prev) => ({ ...prev, audienceType: "SELECTED_COMPANIES" }))}
              />
              Solo aziende selezionate
            </label>
          </div>

          {campaignForm.audienceType === "SELECTED_COMPANIES" ? (
            <div className="mail-audience-box">
              <input
                placeholder="Cerca azienda per nome, email, P.IVA..."
                value={companySearch}
                onChange={(e) => setCompanySearch(e.target.value)}
              />
              <div className="mail-audience-list">
                {filteredCompanies.slice(0, 40).map((company) => (
                  <label key={company.id} className="mail-audience-item">
                    <input
                      type="checkbox"
                      checked={campaignForm.audienceCompanyIds.includes(company.id)}
                      onChange={() => toggleCompanyTarget(company.id)}
                    />
                    <span>{company.legalName || company.name}</span>
                    <small>{company.email}</small>
                  </label>
                ))}
              </div>
              <div className="muted">
                Selezionati: <strong>{campaignForm.audienceCompanyIds.length}</strong>
              </div>
            </div>
          ) : null}

          <div className="actions">
            {campaignForm.id ? (
              <button
                type="button"
                className="btn ghost"
                onClick={() =>
                  setCampaignForm((prev) => ({ ...DEFAULT_CAMPAIGN_FORM, listId: prev.listId || String(selectedListId) }))
                }
              >
                Nuova campagna
              </button>
            ) : null}
            <button type="submit" className="btn primary" disabled={savingCampaign}>
              {savingCampaign ? "Salvataggio..." : campaignForm.id ? "Salva campagna" : "Crea campagna"}
            </button>
          </div>
        </form>

        <div className="table compact mail-campaign-table" style={{ marginTop: 12 }}>
          <div className="row header">
            <div>Campagna</div>
            <div>Stato</div>
            <div>Pubblico</div>
            <div>Invio</div>
            <div>Azioni</div>
          </div>
          {campaigns.map((c) => (
            <div className="row" key={c.id}>
              <div>
                <strong>{c.name}</strong>
                <div className="muted">{c.subject}</div>
              </div>
              <div>
                <span className={`status-pill status-${String(c.status || "DRAFT").toLowerCase()}`}>
                  {campaignStatusLabel(c.status)}
                </span>
                {c.lastError ? <div className="muted" style={{ marginTop: 4 }}>{c.lastError}</div> : null}
              </div>
              <div>
                {c.audienceType === "ALL_ACTIVE" ? "Tutte attive" : `Selezionate (${Array.isArray(c.audienceCompanyIds) ? c.audienceCompanyIds.length : 0})`}
              </div>
              <div>
                {c.sentAt ? new Date(c.sentAt).toLocaleString("it-IT") : c.scheduledAt ? new Date(c.scheduledAt).toLocaleString("it-IT") : "-"}
                <div className="muted">OK {c.sentCount || 0} · KO {c.failedCount || 0}</div>
              </div>
              <div className="actions">
                <button className="btn ghost" type="button" onClick={() => loadCampaignIntoForm(c)}>Modifica</button>
                <button className="btn ghost" type="button" onClick={() => duplicateCampaign(c)}>Duplica</button>
                <button className="btn ghost" type="button" onClick={() => setPreviewCampaign(c)}>Anteprima</button>
                <button
                  className="btn primary"
                  type="button"
                  onClick={() => sendCampaignNow(c.id)}
                  disabled={sendingCampaignId === c.id}
                >
                  {sendingCampaignId === c.id ? "Invio..." : "Invia ora"}
                </button>
                <button className="btn ghost danger" type="button" onClick={() => deleteCampaign(c.id)}>Elimina</button>
              </div>
            </div>
          ))}
          {!campaigns.length ? <div className="row"><div className="muted">Nessuna campagna</div></div> : null}
        </div>
      </div>

      <div className="panel">
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Mail passate (MailUp)</h2>
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              api(`/admin/mail-marketing/history?listId=${selectedListId}`)
                .then((r) => setMailupHistory(r?.items || []))
                .catch(() => setMailupHistory([]))
            }
          >
            Aggiorna storico
          </button>
        </div>
        <div className="table compact mail-history-table" style={{ marginTop: 10 }}>
          <div className="row header">
            <div>ID</div>
            <div>Nome</div>
            <div>Oggetto</div>
            <div>Data</div>
            <div>Azioni</div>
          </div>
          {mailupHistory.map((m, i) => (
            <div className="row" key={String(m.Id || m.id || i)}>
              <div className="mono">{m.Id || m.id || "-"}</div>
              <div>{m.Name || m.name || "-"}</div>
              <div>{m.Subject || m.subject || "-"}</div>
              <div>
                {m.CreationDate || m.createdAt || m.CreateDate
                  ? new Date(m.CreationDate || m.createdAt || m.CreateDate).toLocaleString("it-IT")
                  : "-"}
              </div>
              <div className="actions">
                <button type="button" className="btn ghost" onClick={() => openHistoryMail(m)}>Apri</button>
                <button type="button" className="btn ghost" onClick={() => duplicateFromHistory(m)}>Duplica</button>
              </div>
            </div>
          ))}
          {!mailupHistory.length ? (
            <div className="row">
              <div className="muted">
                Nessuna mail trovata in MailUp per la lista selezionata.
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {previewCampaign ? (
        <div className="modal-backdrop" onClick={() => setPreviewCampaign(null)}>
          <div className="modal product-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Anteprima campagna</h3>
              <button className="btn ghost" onClick={() => setPreviewCampaign(null)}>Chiudi</button>
            </div>
            <div className="panel" style={{ marginTop: 12 }}>
              <div className="muted">Oggetto</div>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>{previewCampaign.subject}</div>
              <div className="mail-preview" dangerouslySetInnerHTML={{ __html: previewCampaign.html || "" }} />
            </div>
          </div>
        </div>
      ) : null}

      {previewHistoryMail ? (
        <div className="modal-backdrop" onClick={() => setPreviewHistoryMail(null)}>
          <div className="modal product-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Mail inviata</h3>
              <button className="btn ghost" onClick={() => setPreviewHistoryMail(null)}>Chiudi</button>
            </div>
            <div className="panel" style={{ marginTop: 12 }}>
              <div className="muted">Nome</div>
              <div style={{ fontWeight: 700 }}>{previewHistoryMail.name}</div>
              <div className="muted" style={{ marginTop: 8 }}>Oggetto</div>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>{previewHistoryMail.subject}</div>
              {previewHistoryMail.html ? (
                <div className="mail-preview" dangerouslySetInnerHTML={{ __html: previewHistoryMail.html }} />
              ) : (
                <div className="muted">Contenuto HTML non disponibile da API MailUp per questa mail.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
