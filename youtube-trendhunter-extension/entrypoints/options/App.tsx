import React, { useState, useEffect } from "react";
import { getApiBaseUrl, setApiBaseUrl, DEFAULT_API_BASE } from "../../shared/constants/api";
import "./App.css";

export default function App() {
  const [url, setUrl] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const current = await getApiBaseUrl();
      setUrl(current);
    })();
  }, []);

  async function handleSave() {
    setSaved(false);
    setError("");
    const trimmed = url.trim();
    if (trimmed && !/^https?:\/\/.+/.test(trimmed)) {
      setError("URL invalide. Doit commencer par http:// ou https://");
      return;
    }
    try {
      await setApiBaseUrl(trimmed);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Erreur lors de la sauvegarde");
    }
  }

  async function handleReset() {
    setUrl(DEFAULT_API_BASE);
    try {
      await setApiBaseUrl("");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Erreur lors de la réinitialisation");
    }
  }

  return (
    <div className="options-container">
      <h1 className="options-title">Paramètres TrendHunter</h1>

      <section className="options-section">
        <h2 className="section-title">URL de l&rsquo;API</h2>
        <p className="section-desc">
          Adresse du serveur backend TrendHunter. Pour le développement local, utilisez{" "}
          <code>http://localhost:3000</code>.
        </p>
        <div className="input-group">
          <input
            className="url-input"
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setSaved(false);
            }}
            placeholder={DEFAULT_API_BASE}
          />
          <button className="btn btn-primary" onClick={handleSave}>
            Sauvegarder
          </button>
          <button className="btn btn-ghost" onClick={handleReset}>
            Réinitialiser
          </button>
        </div>
        {saved && <p className="msg-success">✓ Configuration sauvegardée</p>}
        {error && <p className="msg-error">{error}</p>}
      </section>
    </div>
  );
}
