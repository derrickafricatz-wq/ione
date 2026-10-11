/* I|ONE Book to PDF — isolated feature module. Requires the matching Supabase migration and book-pdf-access function. */
(function () {
  "use strict";

  window.openBookToPdfPanel = function openBookToPdfPanel() {
    const old = document.getElementById("bookToPdfPanel");
    if (old) { old.remove(); return; }

    const panel = document.createElement("div");
    panel.id = "bookToPdfPanel";
    panel.style.cssText = "position:fixed;inset:0;z-index:1000001;background:rgba(0,0,0,.76);display:flex;align-items:center;justify-content:center;padding:16px;";
    panel.innerHTML = `
      <section style="width:min(100%,440px);max-height:90dvh;overflow:auto;background:#0b1714;color:#f2fff9;border:1px solid #285447;border-radius:18px;padding:20px;box-shadow:0 20px 70px #0009;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px;"><div style="font-size:20px;font-weight:800;">Book to PDF</div><button type="button" id="b2pClose" aria-label="Close" style="border:0;background:#19342c;color:#fff;border-radius:10px;width:36px;height:36px;font-size:22px;">×</button></div>
        <p style="margin:0 0 16px;color:#a9c9bd;font-size:13px;line-height:1.5;">Publish a finished PDF in the existing Explore bookstore. The PDF is stored privately.</p>
        <label style="display:block;font-size:12px;color:#b9d7cc;margin:12px 0 6px;">BOOK TITLE</label><input id="b2pTitle" maxlength="160" placeholder="Enter book title" style="width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #31594c;background:#10231d;color:#fff;">
        <label style="display:block;font-size:12px;color:#b9d7cc;margin:12px 0 6px;">CATEGORY</label><select id="b2pCategory" style="width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #31594c;background:#10231d;color:#fff;"><option>SERMONS</option><option>BIBLE</option><option>PRAYER</option><option>TEACHING</option><option>WORSHIP</option><option>PROPHECY</option><option>SPIRITUAL GROWTH</option></select>
        <label style="display:block;font-size:12px;color:#b9d7cc;margin:12px 0 6px;">PRICE (TZS)</label><input id="b2pPrice" type="number" min="1" step="1" inputmode="numeric" placeholder="e.g. 2500" style="width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #31594c;background:#10231d;color:#fff;">
        <label style="display:block;font-size:12px;color:#b9d7cc;margin:12px 0 6px;">PDF FILE (MAX 50 MB)</label><input id="b2pFile" type="file" accept="application/pdf,.pdf" style="width:100%;box-sizing:border-box;padding:10px;border-radius:10px;border:1px dashed #31594c;background:#10231d;color:#d9eee5;">
        <div id="b2pFileInfo" style="font-size:12px;color:#a9c9bd;min-height:18px;margin-top:7px;">Choose a finished PDF from your device.</div><div id="b2pStatus" role="status" style="font-size:13px;color:#bfe8d7;margin-top:12px;line-height:1.5;"></div>
        <button id="b2pPublish" type="button" style="width:100%;margin-top:16px;padding:13px;border:0;border-radius:11px;background:#00c995;color:#04251b;font-weight:800;font-size:15px;">PUBLISH BOOK</button>
      </section>`;
    document.body.appendChild(panel);

    const close = () => panel.remove();
    panel.querySelector("#b2pClose").onclick = close;
    panel.addEventListener("click", e => { if (e.target === panel) close(); });
    const fileInput = panel.querySelector("#b2pFile");
    const info = panel.querySelector("#b2pFileInfo");
    const status = panel.querySelector("#b2pStatus");
    const publish = panel.querySelector("#b2pPublish");

    fileInput.onchange = () => {
      const file = fileInput.files && fileInput.files[0];
      info.textContent = file ? file.name + " • " + (file.size / 1048576).toFixed(2) + " MB" : "Choose a finished PDF from your device.";
      if (file && (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf"))) status.textContent = "Please choose a valid PDF file.";
      else if (file && file.size > 50 * 1024 * 1024) status.textContent = "This file is over the 50 MB limit.";
      else status.textContent = "";
    };

    publish.onclick = async () => {
      const title = panel.querySelector("#b2pTitle").value.trim();
      const category = panel.querySelector("#b2pCategory").value;
      const price = Number(panel.querySelector("#b2pPrice").value.trim());
      const file = fileInput.files && fileInput.files[0];
      if (!title) { status.textContent = "Enter the book title."; panel.querySelector("#b2pTitle").focus(); return; }
      if (!Number.isInteger(price) || price <= 0) { status.textContent = "Enter a whole-number price in TZS."; panel.querySelector("#b2pPrice").focus(); return; }
      if (!file) { status.textContent = "Choose a PDF file first."; return; }
      if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) { status.textContent = "Only PDF files are accepted."; return; }
      if (file.size > 50 * 1024 * 1024) { status.textContent = "This PDF is over the 50 MB limit."; return; }

      publish.disabled = true; publish.style.opacity = ".65"; status.textContent = "Preparing secure upload…";
      let path = "";
      try {
        const session = await ensureHeavensAnonymousSession();
        if (!session || !session.user || !session.user.id) throw new Error("Please reconnect before publishing.");
        const random = window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2);
        path = session.user.id + "/" + random + ".pdf";
        const uploaded = await heavensSupabase.storage.from("paid-book-pdfs").upload(path, file, { contentType: "application/pdf", upsert: false });
        if (uploaded.error) throw uploaded.error;

        status.textContent = "File uploaded securely. Publishing bookstore listing…";
        const inserted = await heavensSupabase.from("heavens_books").insert({
          title, category, price, currency: "TZS", front_cover: null, back_cover: null,
          contents: "", chapters: [], author_id: session.user.id, active: true, pdf_path: path
        }).select("id,title,category,price,currency,pdf_path,created_at").single();
        if (inserted.error) throw inserted.error;

        const row = inserted.data;
        const book = {
          id: "HB-SERVER-" + row.id, supabaseId: row.id, title: row.title,
          category: row.category, price: Number(row.price), currency: row.currency || "TZS",
          contents: "", frontCover: "", backCover: "", pdfPath: row.pdf_path,
          chapters: [], date: row.created_at ? new Date(row.created_at).toLocaleDateString() : ""
        };
        if (typeof markBookPaid === "function") markBookPaid(book);
        status.textContent = "Published successfully. Your PDF is now listed in Explore.";
        publish.textContent = "PUBLISHED";
        setTimeout(close, 1200);
      } catch (error) {
        console.error("Book to PDF publish failed:", error);
        if (path) {
          try { await heavensSupabase.storage.from("paid-book-pdfs").remove([path]); }
          catch (cleanupError) { console.warn("Could not clean up incomplete PDF upload:", cleanupError); }
        }
        status.textContent = error && error.message ? error.message : "Could not publish this PDF. Please try again.";
        publish.disabled = false; publish.style.opacity = "1";
      }
    };
  };

  window.openPaidPdfReader = async function openPaidPdfReader(book) {
    const existing = document.getElementById("heavensReader");
    if (existing) existing.remove();
    try {
      const session = await ensureHeavensAnonymousSession();
      if (!session || !session.access_token) throw new Error("Please reconnect before opening this PDF.");
      const result = await heavensSupabase.functions.invoke("book-pdf-access", {
        body: { book_id: String(book.supabaseId || book.id || "") }
      });
      if (result.error || !result.data || !result.data.success || !result.data.url) {
        console.error("Protected PDF access failed:", result.error || result.data);
        throw new Error((result.data && result.data.error) || "Payment must be confirmed by the server before this PDF can open.");
      }
      const reader = document.createElement("div");
      reader.id = "heavensReader";
      reader.style.cssText = "position:fixed;inset:0;z-index:1000000;background:#07110f;display:flex;flex-direction:column;color:#f3fffb;";
      reader.innerHTML = '<div style="height:56px;flex-shrink:0;display:flex;align-items:center;gap:12px;padding:0 14px;background:#0d211c;border-bottom:1px solid #24443a;"><button type="button" aria-label="Close PDF" style="width:38px;height:38px;border:0;border-radius:10px;background:#17372e;color:#fff;font-size:25px;">×</button><div id="b2pReaderTitle" style="min-width:0;flex:1;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></div><span style="font-size:11px;color:#a8c8bc;">PDF</span></div><iframe title="Book PDF" style="width:100%;height:100%;flex:1;border:0;background:#fff;" referrerpolicy="no-referrer"></iframe>';
      reader.querySelector("#b2pReaderTitle").textContent = String(book.title || "Book PDF");
      reader.querySelector("iframe").src = result.data.url;
      reader.querySelector("button").onclick = () => { reader.remove(); document.body.style.overflow = ""; };
      document.body.appendChild(reader);
      document.body.style.overflow = "hidden";
    } catch (error) {
      console.error("Could not open PDF book:", error);
      alert(error && error.message ? error.message : "Could not open this PDF.");
    }
  };
})();