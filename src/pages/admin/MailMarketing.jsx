import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";

export default function AdminMailMarketing() {
  const [error, setError] = useState("");
  const [status, setStatus] = useState({ configured: false, wsUsername: null });
  const [lists, setLists] = useState([]);
  const [groups, setGroups] = useState([]);
  const [fields, setFields] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [selectedListId, setSelectedListId] = useState(1);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncSummary, setSyncSummary] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState("");

  async function loadAll() {
    setError("");
    try {
      const [statusRes, metaRes, listRes, fieldRes, companyRes] = await Promise.all([
        api("/admin/mail-marketing/status"),
        api("/admin/mail-marketing/meta"),
        api("/admin/mail-marketing/lists"),
        api("/admin/mail-marketing/fields"),
        api("/admin/companies"),
      ]);
      setStatus(statusRes || { configured: false, wsUsername: null });
      const metaLists = metaRes?.lists || [];
      const liveLists = listRes?.items || [];
      const mergedLists = liveLists.length ? liveLists : metaLists;
      setLists(mergedLists);
      const chosenList = Number(mergedLists?.[0]?.id || selectedListId || 1);
      setSelectedListId(chosenList);
      const groupsRes = await api(`/admin/mail-marketing/groups?listId=${chosenList}`);
      setGroups((groupsRes?.items || []).length ? groupsRes.items : metaRes?.groups || []);
      setFields((fieldRes?.items || []).length ? fieldRes.items : metaRes?.fields || []);
      setCompanies(companyRes || []);
    } catch {
      setError("Impossibile caricare Mail Marketing");
    }
  }

  async function loadGroups(listId) {
    try {
      const groupsRes = await api(`/admin/mail-marketing/groups?listId=${listId}`);
      setGroups(groupsRes?.items || []);
    } catch {
      setGroups([]);
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestResult("");
    try {
      const res = await api("/admin/mail-marketing/test", { method: "POST" });
      setTestResult(res?.ok ? "Connessione MailUp OK" : "Connessione non valida");
    } catch (err) {
      setTestResult("Connessione non valida");
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
    } catch {
      setError("Errore sincronizzazione aziende su MailUp");
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Mail Marketing</h1>
          <p>Integrazione MailUp per newsletter, segmenti e sync clienti</p>
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
            <button className="btn primary" onClick={testConnection} disabled={testing}>
              {testing ? "Test in corso..." : "Test connessione"}
            </button>
          </div>
        </div>
        {testResult ? <div className="muted" style={{ marginTop: 8 }}>{testResult}</div> : null}
      </div>

      <div className="panel analytics-grid">
        <div className="analytics-panel">
          <h2>Liste</h2>
          <div className="table compact">
            <div className="row header"><div>ID</div><div>Nome</div><div>GUID</div></div>
            {lists.map((l) => (
              <div key={l.id || l.IdList} className="row">
                <div>{l.id || l.IdList}</div>
                <div>{l.name || l.Name}</div>
                <div className="mono">{l.guid || l.ListGUID || "-"}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="analytics-panel">
          <h2>Gruppi</h2>
          <div className="table compact">
            <div className="row header"><div>Lista</div><div>Gruppo</div><div>Nome</div></div>
            {groups.map((g, i) => (
              <div key={`${g.groupId || g.IdGroup || i}`} className="row">
                <div>{g.listId || g.IdList || selectedListId}</div>
                <div>{g.groupId || g.IdGroup}</div>
                <div>{g.name || g.Name}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Sincronizza aziende su MailUp</h2>
        <div className="form-grid">
          <label>
            Lista
            <select
              className="select"
              value={selectedListId}
              onChange={(e) => {
                const next = Number(e.target.value);
                setSelectedListId(next);
                loadGroups(next);
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
            Gruppo
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
      </div>

      <div className="panel">
        <h2>Campi anagrafica MailUp</h2>
        <div className="table compact">
          <div className="row header"><div>ID campo</div><div>Nome</div><div>Uso</div></div>
          {fields.map((f) => (
            <div className="row" key={f.id || f.Id}>
              <div className="mono">{f.id || f.Id}</div>
              <div>{f.name || f.Name}</div>
              <div>Mappato in sincronizzazione</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

