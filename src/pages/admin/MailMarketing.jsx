import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";
import Portal from "../../components/Portal.jsx";

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
        <button type="button" className="rte-btn" onClick={() => run("bold")} title="Grassetto">B</button>
        <button type="button" className="rte-btn" onClick={() => run("italic")} title="Corsivo">I</button>
        <button type="button" className="rte-btn" onClick={() => run("underline")} title="Sottolineato">U</button>
        <button type="button" className="rte-btn" onClick={() => run("formatBlock", "<h2>")} title="Titolo">H2</button>
        <button type="button" className="rte-btn" onClick={() => run("insertUnorderedList")} title="Elenco">• List</button>
        <button type="button" className="rte-btn" onClick={() => run("justifyLeft")} title="Sinistra">Left</button>
        <button type="button" className="rte-btn" onClick={() => run("justifyCenter")} title="Centra">Center</button>
        <button type="button" className="rte-btn" onClick={addLink} title="Link">Link</button>
        <button type="button" className="rte-btn" onClick={addImageByUrl} title="Immagine URL">Img URL</button>
        <button type="button" className="rte-btn" onClick={() => imageInputRef.current?.click()} title="Upload immagine">Upload</button>
        <button type="button" className="rte-btn" onClick={() => run("removeFormat")} title="Pulisci">Clear</button>
      </div>
      <input ref={imageInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={addImageFromFile} />
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
  const [success, setSuccess] = useState("");
  const [status, setStatus] = useState({ configured: false, wsUsername: null, listId: null });
  const [types, setTypes] = useState([]);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({ subject: "", html: "", active: true });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState("");
  const [sendTestOpen, setSendTestOpen] = useState(null);
  const [sendTestEmail, setSendTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [previewType, setPreviewType] = useState(null);

  async function loadAll() {
    setError("");
    try {
      const [statusRes, typesRes] = await Promise.all([
        api("/admin/mail-marketing/status"),
        api("/admin/mail-marketing/types"),
      ]);
      setStatus(statusRes || { configured: false, wsUsername: null, listId: null });
      setTypes(typesRes || []);
    } catch {
      setError("Impossibile caricare Mail Marketing");
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function testConnection() {
    setTesting(true);
    setTestResult("");
    try {
      const res = await api("/admin/mail-marketing/test-connection", { method: "POST" });
      setTestResult(res?.ok ? "Connessione SMTP OK" : "Connessione fallita");
    } catch (err) {
      const msg = err?.message || "";
      try {
        const p = JSON.parse(msg);
        setTestResult(p?.error || "Connessione SMTP fallita");
      } catch {
        setTestResult(msg || "Connessione SMTP fallita");
      }
    } finally {
      setTesting(false);
    }
  }

  function openEdit(typeObj) {
    setEditing(typeObj.type);
    setDraft({
      subject: typeObj.subject || "",
      html: typeObj.html || "",
      active: typeObj.active ?? true,
    });
  }

  function cancelEdit() {
    setEditing(null);
    setDraft({ subject: "", html: "", active: true });
  }

  async function saveTemplate() {
    if (!editing) return;
    setSaving(true);
    setError("");
    try {
      await api(`/admin/mail-marketing/types/${editing}`, {
        method: "PATCH",
        body: JSON.stringify(draft),
      });
      setSuccess("Template salvato");
      setTimeout(() => setSuccess(""), 3000);
      cancelEdit();
      await loadAll();
    } catch {
      setError("Errore salvataggio template");
    } finally {
      setSaving(false);
    }
  }

  function openSendTest(typeObj) {
    setSendTestOpen(typeObj.type);
    setSendTestEmail("");
  }

  async function doSendTest() {
    if (!sendTestOpen || !sendTestEmail) return;
    setSendingTest(true);
    setError("");
    try {
      await api("/admin/mail-marketing/send-test", {
        method: "POST",
        body: JSON.stringify({ type: sendTestOpen, recipientEmail: sendTestEmail }),
      });
      setSuccess(`Email di test inviata a ${sendTestEmail}`);
      setTimeout(() => setSuccess(""), 4000);
      setSendTestOpen(null);
    } catch (err) {
      const msg = err?.message || "";
      try {
        const p = JSON.parse(msg);
        setError(p?.error || "Invio test fallito");
      } catch {
        setError(msg || "Invio test fallito");
      }
    } finally {
      setSendingTest(false);
    }
  }

  async function toggleActive(typeObj) {
    try {
      await api(`/admin/mail-marketing/types/${typeObj.type}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !typeObj.active }),
      });
      await loadAll();
    } catch {
      setError("Errore aggiornamento stato");
    }
  }

  function insertTag(tag) {
    setDraft((prev) => ({ ...prev, html: prev.html + tag }));
  }

  const editingType = types.find((t) => t.type === editing);

  const SAMPLE_DATA = {
    "{{customer_name}}": "Mario Rossi",
    "{{company_name}}": "Tabaccheria Rossi S.r.l.",
    "{{order_number}}": "ORD-2025-0042",
    "{{order_date}}": new Date().toLocaleDateString("it-IT"),
    "{{order_total}}": "\u20AC 1.250,00",
    "{{order_items}}":
      "<tr><td>Liquido Menta 10ml</td><td>LIQ-MENTA-10</td><td>50</td><td>\u20AC 3,50</td><td>\u20AC 175,00</td></tr>" +
      "<tr><td>Resistenza X-Pro 0.8ohm</td><td>RES-XPRO-08</td><td>100</td><td>\u20AC 2,80</td><td>\u20AC 280,00</td></tr>",
    "{{payment_method}}": "Bonifico",
    "{{shipping_date}}": new Date().toLocaleDateString("it-IT"),
    "{{tracking_number}}": "BRT-1234567890",
    "{{carrier}}": "BRT",
    "{{invoice_number}}": "FT-2025/042",
    "{{invoice_date}}": new Date().toLocaleDateString("it-IT"),
    "{{invoice_total}}": "\u20AC 1.525,00",
    "{{cart_total}}": "\u20AC 890,00",
    "{{cart_items}}":
      '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">' +
      "<tr><td>Liquido Menta 10ml x 30</td><td>\u20AC 105,00</td></tr></table>",
    "{{payment_amount}}": "\u20AC 1.250,00",
    "{{payment_date}}": new Date().toLocaleDateString("it-IT"),
  };

  function previewHtml(typeObj) {
    let html = typeObj.html || "";
    for (const [tag, val] of Object.entries(SAMPLE_DATA)) {
      html = html.replaceAll(tag, val);
    }
    return html;
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Mail Marketing</h1>
          <p>Email transazionali automatiche via MailUp con template personalizzabili</p>
        </div>
      </div>

      <InlineError message={error} onClose={() => setError("")} />
      {success && (
        <div style={{ background: "#dcfce7", color: "#166534", padding: "10px 16px", borderRadius: 8, marginBottom: 14, fontWeight: 600 }}>
          {success}
        </div>
      )}

      <div className="panel">
        <div className="actions" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <strong>Stato MailUp: </strong>
            <span style={{ color: status.configured ? "#15803d" : "#dc2626", fontWeight: 700 }}>
              {status.configured ? "Configurato" : "Non configurato"}
            </span>
            {status.wsUsername ? <span className="muted"> &middot; Account: {status.wsUsername}</span> : null}
            {status.listId ? <span className="muted"> &middot; Lista: {status.listId}</span> : null}
          </div>
          <div className="actions">
            <button className="btn ghost" onClick={loadAll}>Ricarica</button>
            <button className="btn ghost" onClick={testConnection} disabled={testing}>
              {testing ? "Test in corso..." : "Test connessione"}
            </button>
          </div>
        </div>
        {testResult ? <div className="muted" style={{ marginTop: 8 }}>{testResult}</div> : null}
        {!status.configured && (
          <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
            Per attivare le email, aggiungi nel file <code>.env</code> del backend:<br />
            <code>MAILUP_CLIENT_ID=tuo_client_id</code><br />
            <code>MAILUP_CLIENT_SECRET=tuo_client_secret</code><br />
            <code>MAILUP_USERNAME=tuo_username</code><br />
            <code>MAILUP_PASSWORD=tua_password</code><br />
            <code>MAILUP_DEFAULT_LIST_ID=1</code>
          </div>
        )}
      </div>

      {/* Email types list */}
      <div className="panel">
        <h2 style={{ marginBottom: 12 }}>Email transazionali</h2>
        <p className="muted" style={{ marginBottom: 16 }}>
          Ogni tipo di email ha un template personalizzabile con tag dinamici (stile WooCommerce).
          Quando l&apos;evento corrispondente si verifica, l&apos;email viene inviata automaticamente al cliente.
        </p>

        <div className="mail-types-grid">
          {types.map((t) => (
            <div className="mail-type-card" key={t.type}>
              <div className="mail-type-card-head">
                <div>
                  <strong>{t.label}</strong>
                  <div className="mono muted" style={{ fontSize: 12 }}>{t.type}</div>
                </div>
                <span
                  className={`tag ${t.active ? "success" : "warn"}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => toggleActive(t)}
                  title={t.active ? "Clicca per disabilitare" : "Clicca per abilitare"}
                >
                  {t.active ? "Attiva" : "Disattivata"}
                </span>
              </div>

              <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
                <strong>Oggetto:</strong> {t.subject}
              </div>

              <div className="mail-type-tags">
                {t.tags.map((tag) => (
                  <span key={tag.tag} className="mail-tag" title={tag.description}>
                    {tag.tag}
                  </span>
                ))}
              </div>

              <div className="actions" style={{ marginTop: 10 }}>
                <button className="btn ghost" onClick={() => openEdit(t)}>Modifica template</button>
                <button className="btn ghost" onClick={() => setPreviewType(t)}>Anteprima</button>
                <button className="btn primary small" onClick={() => openSendTest(t)}>Invia test</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Edit template modal */}
      {editing && editingType && (
        <Portal>
          <div className="modal-backdrop" onClick={cancelEdit}>
            <div className="modal product-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 960 }}>
              <div className="modal-header">
                <h3>Modifica template &mdash; {editingType.label}</h3>
                <button className="btn ghost" onClick={cancelEdit}>Chiudi</button>
              </div>
              <div className="modal-body" style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: 20 }}>
                <div>
                  <label>
                    Oggetto email
                    <input
                      value={draft.subject}
                      onChange={(e) => setDraft((p) => ({ ...p, subject: e.target.value }))}
                      placeholder={"Oggetto con {{tag}}"}
                    />
                  </label>
                  <label style={{ marginTop: 12 }}>
                    Contenuto email (HTML)
                    <RichTextEditor
                      value={draft.html}
                      onChange={(next) => setDraft((p) => ({ ...p, html: next }))}
                      placeholder="Scrivi il template email..."
                    />
                  </label>
                  <label className="checkbox-row" style={{ marginTop: 12 }}>
                    <input
                      type="checkbox"
                      checked={draft.active}
                      onChange={(e) => setDraft((p) => ({ ...p, active: e.target.checked }))}
                    />
                    Email attiva (invio automatico)
                  </label>
                  <div className="actions" style={{ marginTop: 16 }}>
                    <button className="btn ghost" onClick={cancelEdit}>Annulla</button>
                    <button className="btn primary" onClick={saveTemplate} disabled={saving}>
                      {saving ? "Salvataggio..." : "Salva template"}
                    </button>
                  </div>
                </div>
                <div className="mail-tags-sidebar">
                  <h4>Tag disponibili</h4>
                  <p className="muted" style={{ fontSize: 12 }}>Clicca per inserire nel template</p>
                  {editingType.tags.map((tag) => (
                    <button
                      key={tag.tag}
                      type="button"
                      className="mail-tag-btn"
                      onClick={() => insertTag(tag.tag)}
                      title={tag.description}
                    >
                      <code>{tag.tag}</code>
                      <span className="muted">{tag.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* Preview modal */}
      {previewType && (
        <Portal>
          <div className="modal-backdrop" onClick={() => setPreviewType(null)}>
            <div className="modal product-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 740 }}>
              <div className="modal-header">
                <h3>Anteprima &mdash; {previewType.label}</h3>
                <button className="btn ghost" onClick={() => setPreviewType(null)}>Chiudi</button>
              </div>
              <div className="modal-body modal-body-single">
                <div className="muted" style={{ marginBottom: 4 }}>Oggetto</div>
                <div style={{ fontWeight: 700, marginBottom: 16 }}>
                  {Object.entries(SAMPLE_DATA).reduce(
                    (s, [k, v]) => s.replaceAll(k, v),
                    previewType.subject || ""
                  )}
                </div>
                <div
                  className="mail-preview"
                  dangerouslySetInnerHTML={{ __html: previewHtml(previewType) }}
                />
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* Send test modal */}
      {sendTestOpen && (
        <Portal>
          <div className="modal-backdrop" onClick={() => setSendTestOpen(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
              <div className="modal-header">
                <h3>Invia email di test</h3>
                <button className="btn ghost" onClick={() => setSendTestOpen(null)}>Chiudi</button>
              </div>
              <div className="modal-body modal-body-single">
                <p className="muted">
                  Verr&agrave; inviata un&apos;email con dati di esempio per il tipo <strong>{sendTestOpen}</strong>.
                </p>
                <label>
                  Email destinatario
                  <input
                    type="email"
                    value={sendTestEmail}
                    onChange={(e) => setSendTestEmail(e.target.value)}
                    placeholder="tua@email.it"
                    autoFocus
                  />
                </label>
                <div className="actions" style={{ marginTop: 16 }}>
                  <button className="btn ghost" onClick={() => setSendTestOpen(null)}>Annulla</button>
                  <button
                    className="btn primary"
                    onClick={doSendTest}
                    disabled={sendingTest || !sendTestEmail}
                  >
                    {sendingTest ? "Invio..." : "Invia test"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* Info box */}
      <div className="panel" style={{ background: "#f0f9ff", border: "1px solid #bae6fd" }}>
        <h3 style={{ margin: "0 0 8px", color: "#0369a1" }}>Come funziona</h3>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8, color: "#334155" }}>
          <li><strong>Conferma ordine</strong> &mdash; inviata automaticamente quando un ordine passa a stato &ldquo;Approvato&rdquo;</li>
          <li><strong>Ordine spedito</strong> &mdash; inviata quando un ordine passa a stato &ldquo;Evaso&rdquo;</li>
          <li><strong>Fattura disponibile</strong> &mdash; inviata quando si genera una fattura da un ordine</li>
          <li><strong>Carrello abbandonato</strong> &mdash; da inviare manualmente o tramite job schedulato</li>
          <li><strong>Benvenuto</strong> &mdash; da inviare quando un&apos;azienda viene attivata</li>
          <li><strong>Pagamento ricevuto</strong> &mdash; da inviare manualmente con &ldquo;Invia test&rdquo; specificando i dati</li>
        </ul>
        <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>
          I tag come <code>{"{{customer_name}}"}</code>, <code>{"{{order_number}}"}</code> ecc.
          vengono sostituiti automaticamente con i dati reali al momento dell&apos;invio.
        </p>
      </div>
    </section>
  );
}
