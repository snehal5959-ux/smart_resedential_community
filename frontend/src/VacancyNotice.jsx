import { useEffect, useState } from "react";
import { apiFetch as fetch, readApiJson } from "./api";

export default function VacancyNotice({ onExplore }) {
  const [flats, setFlats] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let current = true;
    fetch("/api/flats/vacant")
      .then(readApiJson)
      .then((data) => { if (current) setFlats(data); })
      .catch((requestError) => { if (current) setError(requestError.message || "Could not check vacant flats."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []);

  if (loading || (!flats.length && !error)) return null;

  if (error) {
    return <section className="vacancy-load-error" role="status">Flat availability could not be loaded: {error}</section>;
  }

  const visibleFlats = flats.slice(0, 4);
  return (
    <section className="vacancy-banner" aria-labelledby="vacancy-title">
      <div className="vacancy-copy">
        <span className="vacancy-eyebrow">A NEW HOME OPPORTUNITY</span>
        <h2 id="vacancy-title">Make room for what’s next.</h2>
        <p>
          {flats.length} {flats.length === 1 ? "flat is" : "flats are"} currently vacant in the community.
          Interested in buying? Ask the community manager about viewings and ownership details.
        </p>
        <button type="button" className="vacancy-cta" onClick={onExplore}>Explore available flats <span aria-hidden="true">→</span></button>
      </div>
      <div className="vacancy-units" aria-label="Currently vacant flats">
        {visibleFlats.map((flat) => (
          <div className="vacancy-unit" key={flat.id}>
            <span>{flat.block}</span><strong>{flat.flat}</strong><small>Vacant</small>
          </div>
        ))}
        {flats.length > visibleFlats.length && <span className="vacancy-more">+{flats.length - visibleFlats.length} more</span>}
      </div>
    </section>
  );
}
