/**
 * معالجة نصوص عقل البوت: توحيد العربية للبحث بالكلمات، تقسيم المعرفة لمقاطع، وتحويل HTML لنص.
 */

const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

// كلمات شائعة لا تميّز معنى السؤال — تُستبعد من مطابقة الكلمات المفتاحية.
const STOPWORDS = new Set(
  [
    "في", "من", "على", "الى", "عن", "مع", "هل", "ما", "ماذا", "هو", "هي", "انا", "انت", "انتم", "هذا", "هذه", "ذلك", "تلك",
    "او", "ثم", "لو", "اذا", "كان", "كانت", "يكون", "عند", "عندكم", "عندك", "لكم", "لك", "لي", "يا", "و", "ف", "ب", "ل",
    "اي", "ايش", "وش", "شو", "اللي", "الي", "كده", "كدا", "طيب", "لو سمحت", "ممكن", "بس", "مش", "لا", "نعم", "ايوه",
    "the", "a", "an", "is", "are", "of", "to", "in", "and", "or", "for", "on", "do", "you", "i", "it", "what", "how",
  ].map((w) => normalizeArabic(w))
);

/** توحيد الكتابة العربية: إزالة التشكيل والتطويل، توحيد الألف والياء والتاء المربوطة، أرقام هندية ← لاتينية. */
export function normalizeArabic(text: string): string {
  return text
    .replace(DIACRITICS, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .toLowerCase();
}

/** كلمات البحث: موحّدة، بلا كلمات شائعة، مع حذف "ال" التعريف للمطابقة المرنة. */
export function tokenize(text: string): string[] {
  return normalizeArabic(text)
    .split(/[^\p{L}\p{N}]+/u)
    .map((w) => (w.length > 4 && w.startsWith("ال") ? w.slice(2) : w))
    .map((w) => (w.length > 3 && /^(و|ف|ب)ال/.test(w) ? w.slice(3) : w))
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

const CHUNK_TARGET = 700;
const CHUNK_OVERLAP = 120;

/**
 * تقسيم لمقاطع ~700 حرف على حدود الفقرات/الجمل مع تداخل بسيط — مقطع قصير مكتفٍ بذاته يُدرَج وحده في سياق
 * الرد بدل المستند كاملاً.
 */
export function chunkText(raw: string): string[] {
  const text = raw.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return [];
  if (text.length <= CHUNK_TARGET) return [text];

  const units = text.split(/\n\n+/).flatMap((para) =>
    para.length <= CHUNK_TARGET ? [para] : para.split(/(?<=[.!؟?。\n])\s+/).flatMap((s) => (s.length <= CHUNK_TARGET ? [s] : hardSplit(s)))
  );

  const chunks: string[] = [];
  let current = "";
  for (const unit of units) {
    if (current && current.length + unit.length + 2 > CHUNK_TARGET) {
      chunks.push(current.trim());
      const tail = current.slice(-CHUNK_OVERLAP);
      const cut = tail.indexOf(" ");
      current = (cut >= 0 ? tail.slice(cut + 1) : "") + "\n" + unit;
    } else {
      current = current ? `${current}\n\n${unit}` : unit;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function hardSplit(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += CHUNK_TARGET - CHUNK_OVERLAP) out.push(s.slice(i, i + CHUNK_TARGET));
  return out;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** HTML صفحة ← نص مقروء (بلا سكربتات/تنسيقات/قوائم تنقّل)، مع العنوان. */
export function htmlToText(html: string): { title: string | null; text: string } {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? null;
  const body = html
    .replace(/<(script|style|noscript|svg|nav|footer|header|iframe|form)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : " ";
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    });
  const text = body
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
  return { title: title ? htmlToText(title).text || title : null, text };
}
