"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import type { MyReview } from "@resume/shared/types/api";
import { api, ApiError } from "@/lib/api-client";
import { Notice } from "./ui";

const LABELS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

/** Star picker: arrow keys work, and each star says what it means. */
export function Stars({ value, onChange, size = "h-6 w-6" }: { value: number; onChange?: (v: number) => void; size?: string }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  if (!onChange)
    return (
      <span className="inline-flex" aria-label={`${value} out of 5 stars`}>
        {[1, 2, 3, 4, 5].map((i) => <Star key={i} className={`${size} ${i <= value ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} aria-hidden />)}
      </span>
    );
  return (
    <span className="inline-flex" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={`${i} star${i > 1 ? "s" : ""}: ${LABELS[i]}`}
          onMouseEnter={() => setHover(i)}
          onClick={() => onChange(i)}
          className="rounded p-0.5 transition hover:scale-110"
        >
          <Star className={`${size} ${i <= shown ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} aria-hidden />
        </button>
      ))}
    </span>
  );
}

/** "Rate us" card on the user's dashboard: one review per user, editable any time. */
export function ReviewCard() {
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState<MyReview | null>(null);
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thanks, setThanks] = useState(false);

  useEffect(() => {
    api<{ review: MyReview | null }>("/api/reviews/mine")
      .then(({ review }) => {
        setSaved(review);
        if (review) {
          setRating(review.rating);
          setComment(review.comment);
        }
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return null;

  if (saved && !editing)
    return (
      <section className="card p-5 text-sm" aria-labelledby="review-h">
        <h2 id="review-h" className="font-bold">{thanks ? "Thank you! 🙏" : "Your review"}</h2>
        <div className="mt-2"><Stars value={saved.rating} size="h-5 w-5" /></div>
        {saved.comment ? <p className="mt-2 text-slate-700">&ldquo;{saved.comment}&rdquo;</p> : null}
        <button className="btn-ghost mt-2 h-8 px-0 text-xs text-brand-700" onClick={() => { setEditing(true); setThanks(false); }}>Edit review</button>
      </section>
    );

  return (
    <section className="card p-5 text-sm" aria-labelledby="review-h">
      <h2 id="review-h" className="font-bold">How is the resume builder?</h2>
      <p className="mt-1 text-slate-600">Your rating helps us improve, and helps others decide.</p>
      <form
        className="mt-3 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const { review } = await api<{ review: MyReview }>("/api/reviews/mine", { method: "PUT", body: { rating, comment } });
            setSaved(review);
            setEditing(false);
            setThanks(true);
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Couldn't save your review.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="flex items-center gap-2">
          <Stars value={rating} onChange={setRating} />
          {rating ? <span className="text-xs font-medium text-slate-600">{LABELS[rating]}</span> : null}
        </div>
        <label className="sr-only" htmlFor="review-comment">Your review</label>
        <textarea
          id="review-comment"
          rows={3}
          maxLength={600}
          className="field resize-y"
          placeholder="What did you like? What could be better? (optional)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        {error ? <Notice tone="error">{error}</Notice> : null}
        <div className="flex items-center gap-2">
          <button className="btn-primary" disabled={busy || rating < 1}>{busy ? "Saving…" : saved ? "Update review" : "Submit review"}</button>
          {saved ? <button type="button" className="btn-ghost" onClick={() => { setEditing(false); setRating(saved.rating); setComment(saved.comment); }}>Cancel</button> : null}
        </div>
      </form>
    </section>
  );
}
