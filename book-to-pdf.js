/* I|ONE Book to PDF — isolated feature module. Requires the matching Supabase migration and book-pdf-access function. */
(function () {
  "use strict";

  async function compressFrontCover(file) {
    if (!file) return "";
    let bitmap;
    try {
      if (window.createImageBitmap) bitmap = await createImageBitmap(file);
      else {
        bitmap = await new Promise((resolve, reject) => {
          const image = new Image();
          const url = URL.createObjectURL(file);
          image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
          image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read cover image.")); };
          image.src = url;
        });
      }
      const maxW = 900, maxH = 1200;
      const ratio = Math.min(1, maxW / bitmap.width, maxH / bitmap.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("Cover image processing is unavailable.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL("image/jpeg", 0.78);
      if (bitmap.close) bitmap.close();
      return data;
    } catch (error) {
      if (bitmap && bitmap.close) bitmap.close();
      console.warn("Front cover compression failed:", error);
      return "";
    }
  }


  window.openMyPublishedBooksPanel = function openMyPublishedBooksPanel() {
    const old = document.getElementById("ioneMyPublishedBooks");
    if (old) old.remove();
    const panel = document.createElement("div");
    panel.id = "ioneMyPublishedBooks";
    panel.style.cssText = "position:fixed;inset:0;z-index:10020;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;";
    panel.innerHTML = "<section style=\"width:min(760px,100%);max-height:92dvh;overflow:auto;background:#071711;border:1px solid #2a604b;border-radius:18px;padding:16px;box-sizing:border-box;color:#eafff4;font-family:Arial,sans-serif;\"><div style=\"display:flex;align-items:center;justify-content:space-between;gap:10px;\"><div><div style=\"font-size:20px;font-weight:900;\">MY PUBLISHED BOOKS</div><div style=\"font-size:12px;color:#9dbdaf;margin-top:5px;\">Manage your books, prices and free/paid access.</div></div><button id=\"ioneBooksManagerClose\" type=\"button\" style=\"border:0;background:#173529;color:#fff;border-radius:10px;width:38px;height:38px;font-size:22px;\">×</button></div><div id=\"ioneBooksManagerStatus\" role=\"status\" style=\"font-size:13px;line-height:1.5;margin:12px 0;color:#bfe8d7;\">Loading your published books…</div><div id=\"ioneBooksManagerList\" style=\"display:grid;gap:10px;\"></div></section>";
    document.body.appendChild(panel);
    const status = panel.querySelector("#ioneBooksManagerStatus");
    const list = panel.querySelector("#ioneBooksManagerList");
    const close = () => panel.remove();
    panel.querySelector("#ioneBooksManagerClose").onclick = close;
    panel.addEventListener("click", event => { if (event.target === panel) close(); });

    const removeExploreCard = id => {
      const store = document.getElementById("heavensBookstore");
      if (store) store.querySelectorAll(".hb-card").forEach(card => {
        const key = String(card.dataset.bookId || "");
        if (key === String(id) || key === "HB-SERVER-" + String(id)) card.remove();
      });
      try {
        const local = JSON.parse(localStorage.getItem("savedBooks") || "[]");
        localStorage.setItem("savedBooks", JSON.stringify(local.filter(book => String(book.supabaseId || book.id) !== String(id))));
      } catch (_) {}
    };

    const createBookCard = book => {
      const card = document.createElement("article");
      card.style.cssText = "display:grid;grid-template-columns:76px minmax(0,1fr);gap:12px;padding:12px;border:1px solid #244b3b;border-radius:13px;background:#0b2118;min-width:0;";
      const cover = document.createElement("div");
      cover.style.cssText = "width:76px;height:100px;border-radius:7px;overflow:hidden;background:#102c22;display:flex;align-items:center;justify-content:center;color:#bfe8d7;text-align:center;font-size:11px;overflow-wrap:anywhere;";
      if (book.front_cover) {
        const img = document.createElement("img"); img.src = book.front_cover; img.alt = "Book cover";
        img.style.cssText = "width:100%;height:100%;object-fit:cover;"; cover.appendChild(img);
      } else cover.textContent = String(book.title || "BOOK");
      const details = document.createElement("div"); details.style.cssText = "min-width:0;display:grid;gap:8px;align-content:start;";
      const title = document.createElement("div"); title.textContent = String(book.title || "Untitled book");
      title.style.cssText = "font-size:15px;font-weight:900;overflow-wrap:anywhere;";
      const kind = document.createElement("div"); kind.textContent = (book.pdf_path ? "PDF book" : "Created in I|ONE") + " • " + (book.active ? "Published" : "Revoked");
      kind.style.cssText = "font-size:11px;color:#9dbdaf;";
      const controls = document.createElement("div"); controls.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;align-items:center;";
      const price = document.createElement("input"); price.type = "number"; price.min = "0"; price.step = "1"; price.inputMode = "numeric"; price.value = String(Number(book.price || 0));
      price.setAttribute("aria-label", "Price in TZS"); price.style.cssText = "width:125px;max-width:42%;padding:10px;border-radius:9px;border:1px solid #31594c;background:#07140f;color:#fff;box-sizing:border-box;";
      const priceLabel = document.createElement("span"); priceLabel.textContent = "TZS"; priceLabel.style.cssText = "font-size:11px;color:#9dbdaf;margin-left:-3px;";
      const paidLabel = document.createElement("label"); paidLabel.style.cssText = "display:flex;align-items:center;gap:6px;font-size:12px;font-weight:800;";
      const paidToggle = document.createElement("input"); paidToggle.type = "checkbox"; paidToggle.checked = book.payment_required !== false; paidToggle.style.cssText = "width:18px;height:18px;accent-color:#00c995;";
      const paidText = document.createElement("span"); paidText.textContent = paidToggle.checked ? "PAYMENT ON" : "FREE TO READ";
      paidToggle.onchange = () => { paidText.textContent = paidToggle.checked ? "PAYMENT ON" : "FREE TO READ"; };
      paidLabel.append(paidToggle, paidText); controls.append(price, priceLabel, paidLabel);
      const actions = document.createElement("div"); actions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;";
      const save = document.createElement("button"); save.type = "button"; save.textContent = "SAVE PRICE & ACCESS";
      save.style.cssText = "padding:10px 12px;border:0;border-radius:9px;background:#00c995;color:#05251b;font-weight:900;font-size:11px;";
      const revoke = document.createElement("button"); revoke.type = "button"; revoke.textContent = "REVOKE & DELETE";
      revoke.style.cssText = "padding:10px 12px;border:1px solid #a84444;border-radius:9px;background:#321515;color:#ffe4e4;font-weight:900;font-size:11px;";
      save.onclick = async () => {
        const nextPrice = Number(price.value);
        if (!Number.isInteger(nextPrice) || nextPrice < 0) { status.textContent = "Enter a whole-number price of 0 TZS or more."; price.focus(); return; }
        if (paidToggle.checked && nextPrice <= 0) { status.textContent = "Set a price above 0 TZS before turning payment on."; price.focus(); return; }
        save.disabled = true; save.textContent = "SAVING…";
        try {
          const result = await heavensSupabase.functions.invoke("book-library-manage", { body: { action: "update", book_id: String(book.id), price: nextPrice, payment_required: paidToggle.checked } });
          if (result.error || !result.data || !result.data.success) throw new Error((result.data && result.data.error) || "Could not save the book settings.");
          book.price = nextPrice; book.payment_required = paidToggle.checked;
          status.textContent = "Saved. Existing purchases remain saved.";
          const liveStore = document.getElementById("heavensBookstore");
          if (liveStore) {
            liveStore.querySelectorAll(".hb-card").forEach(liveCard => {
              if (String(liveCard.dataset.bookId || "") !== "HB-SERVER-" + String(book.id)) return;
              const priceNode = liveCard.querySelector(".hb-price");
              if (priceNode) priceNode.textContent = nextPrice > 0 ? "TZS " + nextPrice.toLocaleString() : "FREE";
              const lock = liveCard.querySelector(".hb-lock");
              if (lock && !paidToggle.checked) lock.textContent = "Free to read";
              const button = liveCard.querySelector(".hb-btn:not(.hb-check-payment)");
              if (button && !paidToggle.checked) { button.textContent = "READ"; button.classList.remove("pay"); button.classList.add("read"); }
            });
          }
          save.textContent = "SAVED";
        } catch (error) {
          status.textContent = error && error.message ? error.message : "Could not save this book.";
          save.textContent = "SAVE PRICE & ACCESS";
        } finally { save.disabled = false; }
      };
      revoke.onclick = async () => {
        if (!confirm("Permanently delete " + String(book.title || "this book") + " from Explore and Supabase? Payment and access records will also be deleted. This cannot be undone.")) return;
        revoke.disabled = true; revoke.textContent = "DELETING…";
        try {
          const result = await heavensSupabase.functions.invoke("book-library-manage", { body: { action: "delete", book_id: String(book.id) } });
          if (result.error || !result.data || !result.data.success) throw new Error((result.data && result.data.error) || "Could not delete this book.");
          removeExploreCard(book.id); card.remove();
          status.textContent = result.data.warning || "Book permanently deleted from the public library and database.";
          if (!list.children.length) { const empty = document.createElement("div"); empty.textContent = "You have no published books in this author account."; empty.style.color = "#9dbdaf"; list.appendChild(empty); }
        } catch (error) {
          status.textContent = error && error.message ? error.message : "Could not delete this book.";
          revoke.disabled = false; revoke.textContent = "REVOKE & DELETE";
        }
      };
      actions.append(save, revoke); details.append(title, kind, controls, actions); card.append(cover, details);
      return card;
    };

    (async () => {
      try {
        const result = await heavensSupabase.functions.invoke("book-library-manage", { body: { action: "my_books" } });
        if (result.error || !result.data || !result.data.success) throw new Error((result.data && result.data.error) || "Could not load your published books.");
        const books = Array.isArray(result.data.books) ? result.data.books : [];
        list.replaceChildren();
        if (!books.length) { status.textContent = "No books are published under this author account yet."; return; }
        status.textContent = books.length + " published book" + (books.length === 1 ? "" : "s") + ". Change prices, switch between paid and free, or revoke a book.";
        books.forEach(book => list.appendChild(createBookCard(book)));
      } catch (error) {
        status.textContent = error && error.message ? error.message : "Could not load your published books. Reopen the panel and try again.";
      }
    })();
  };

  window.openBookToPdfPanel = function openBookToPdfPanel() {
    const old = document.getElementById("bookToPdfPanel");
    if (old) { old.remove(); return; }

    const panel = document.createElement("div");
    panel.id = "bookToPdfPanel";
    panel.style.cssText = "position:fixed;inset:0;z-index:1000001;background:rgba(0,0,0,.76);display:flex;align-items:center;justify-content:center;padding:16px;";
    panel.innerHTML = `
      <section style="width:min(100%,440px);max-height:90dvh;overflow:auto;background:#0b1714;color:#f2fff9;border:1px solid #285447;border-radius:18px;padding:20px;box-shadow:0 20px 70px #0009;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px;"><div style="font-size:20px;font-weight:800;">Book to PDF</div><button type="button" onclick="openMyPublishedBooksPanel()" style="border:1px solid #31594c;background:#173529;color:#eafff8;border-radius:9px;padding:8px;font-size:11px;font-weight:800;">MY BOOKS</button><button type="button" id="b2pClose" aria-label="Close" style="border:0;background:#19342c;color:#fff;border-radius:10px;width:36px;height:36px;font-size:22px;">×</button></div>
        <p style="margin:0 0 16px;color:#a9c9bd;font-size:13px;line-height:1.5;">Publish a finished PDF in the existing Explore bookstore. The PDF is stored privately.</p>
        <label style="display:block;font-size:12px;color:#b9d7cc;margin:12px 0 6px;">BOOK TITLE</label><input id="b2pTitle" maxlength="160" placeholder="Enter book title" style="width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #31594c;background:#10231d;color:#fff;">
        <label style="display:block;font-size:12px;color:#b9d7cc;margin:12px 0 6px;">CATEGORY</label><select id="b2pCategory" style="width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #31594c;background:#10231d;color:#fff;"><option>SERMONS</option><option>BIBLE</option><option>PRAYER</option><option>TEACHING</option><option>WORSHIP</option><option>PROPHECY</option><option>SPIRITUAL GROWTH</option></select>
        <label style="display:block;font-size:12px;color:#b9d7cc;margin:12px 0 6px;">PRICE (TZS)</label><input id="b2pPrice" type="number" min="1" step="1" inputmode="numeric" placeholder="e.g. 2500" style="width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #31594c;background:#10231d;color:#fff;">
        <label style="display:block;font-size:12px;color:#b9d7cc;margin:12px 0 6px;">FRONT COVER IMAGE (OPTIONAL)</label><input id="b2pCover" type="file" accept="image/*" style="width:100%;box-sizing:border-box;padding:10px;border-radius:10px;border:1px dashed #31594c;background:#10231d;color:#d9eee5;"><div id="b2pCoverPreview" style="display:none;margin-top:9px;max-width:150px;aspect-ratio:3/4;overflow:hidden;border-radius:10px;border:1px solid #31594c;"></div><div style="margin-top:15px;padding:12px;border:1px solid #31594c;border-radius:12px;background:#0e211b;"><label style="display:block;font-size:12px;color:#b9d7cc;margin:0 0 7px;">UPDATE COVER FOR AN EXISTING PDF BOOK</label><select id="b2pExistingBook" style="width:100%;box-sizing:border-box;padding:11px;border-radius:9px;border:1px solid #31594c;background:#10231d;color:#fff;"><option value="">Loading your published PDF books…</option></select><button id="b2pUpdateCover" type="button" style="width:100%;margin-top:9px;padding:11px;border:1px solid #2a6b54;border-radius:9px;background:#163c2f;color:#dffff2;font-weight:800;">UPDATE COVER ONLY</button><div style="font-size:11px;color:#9dbdaf;line-height:1.45;margin-top:7px;">Choose a book you already published and upload its new front cover above. Its PDF, title, price, and payment records will stay unchanged.</div></div><label style="display:block;font-size:12px;color:#b9d7cc;margin:12px 0 6px;">PDF FILE (MAX 50 MB)</label><input id="b2pFile" type="file" accept="application/pdf,.pdf" style="width:100%;box-sizing:border-box;padding:10px;border-radius:10px;border:1px dashed #31594c;background:#10231d;color:#d9eee5;">
        <div id="b2pFileInfo" style="font-size:12px;color:#a9c9bd;min-height:18px;margin-top:7px;">Choose a finished PDF from your device.</div><div id="b2pStatus" role="status" style="font-size:13px;color:#bfe8d7;margin-top:12px;line-height:1.5;"></div>
        <button id="b2pPublish" type="button" style="width:100%;margin-top:16px;padding:13px;border:0;border-radius:11px;background:#00c995;color:#04251b;font-weight:800;font-size:15px;">PUBLISH BOOK</button>
      </section>`;
    document.body.appendChild(panel);

    const close = () => panel.remove();
    panel.querySelector("#b2pClose").onclick = close;
    panel.addEventListener("click", e => { if (e.target === panel) close(); });
    const fileInput = panel.querySelector("#b2pFile");
    const coverInput = panel.querySelector("#b2pCover");
    const coverPreview = panel.querySelector("#b2pCoverPreview");
    const existingBookSelect = panel.querySelector("#b2pExistingBook");
    const updateCoverButton = panel.querySelector("#b2pUpdateCover");
    const info = panel.querySelector("#b2pFileInfo");
    const status = panel.querySelector("#b2pStatus");
    const publish = panel.querySelector("#b2pPublish");

    (async () => {
      try {
        const session = await ensureHeavensAnonymousSession();
        if (!session || !session.user) throw new Error("Please reconnect to load your published books.");
        const { data, error } = await heavensSupabase
          .from("heavens_books")
          .select("id,title,pdf_path,created_at,author_id")
          .eq("active", true)
          .not("pdf_path", "is", null)
          .order("created_at", { ascending: false });
        if (error) throw error;
        existingBookSelect.innerHTML = '<option value="">Choose an existing PDF book…</option>';
        (data || []).forEach(item => {
          const option = document.createElement("option");
          option.value = String(item.id);
          option.textContent = String(item.title || "Untitled PDF book") + (item.author_id === session.user.id ? " — YOUR BOOK" : "");
          if (item.author_id !== session.user.id) option.disabled = true;
          existingBookSelect.appendChild(option);
        });
        if (!data || !data.length) {
          existingBookSelect.innerHTML = '<option value="">No published PDF books found</option>';
        }
      } catch (error) {
        console.warn("Could not load existing PDF books for cover updates:", error);
        existingBookSelect.innerHTML = '<option value="">Could not load existing PDF books</option>';
      }
    })();

    updateCoverButton.onclick = async () => {
      const bookId = existingBookSelect.value;
      const coverFile = coverInput.files && coverInput.files[0];
      if (!bookId) { status.textContent = "Choose one of your existing PDF books first."; return; }
      if (!coverFile) { status.textContent = "Upload the new front cover image above first."; coverInput.focus(); return; }
      if (!coverFile.type || !coverFile.type.startsWith("image/")) { status.textContent = "Please choose a valid front cover image."; return; }
      if (coverFile.size > 15 * 1024 * 1024) { status.textContent = "The cover image must be 15 MB or smaller."; return; }
      updateCoverButton.disabled = true;
      updateCoverButton.style.opacity = ".65";
      try {
        status.textContent = "Preparing the new cover…";
        const frontCover = await compressFrontCover(coverFile);
        if (!frontCover) throw new Error("Could not process the cover image. Please choose another image.");
        const session = await ensureHeavensAnonymousSession();
        if (!session || !session.user) throw new Error("Please reconnect before updating the cover.");
        status.textContent = "Updating the existing book cover…";
        const { data, error } = await heavensSupabase
          .from("heavens_books")
          .update({ front_cover: frontCover })
          .eq("id", bookId)
          .eq("author_id", session.user.id)
          .not("pdf_path", "is", null)
          .select("id")
          .single();
        if (error) throw error;
        if (!data) throw new Error("No matching book was updated. Please choose one of your own PDF books.");
        status.textContent = "Front cover updated. The book's PDF, price, and payment records are unchanged.";
        updateCoverButton.textContent = "COVER UPDATED";
      } catch (error) {
        console.error("Existing PDF cover update failed:", error);
        status.textContent = error && error.message ? error.message : "Could not update this cover. Please try again.";
        updateCoverButton.disabled = false;
        updateCoverButton.style.opacity = "1";
      }
    };

    coverInput.onchange = () => {
      const cover = coverInput.files && coverInput.files[0];
      coverPreview.innerHTML = "";
      coverPreview.style.display = cover ? "block" : "none";
      if (!cover) return;
      if (!cover.type || !cover.type.startsWith("image/")) {
        status.textContent = "Please choose a valid image for the front cover.";
        coverInput.value = "";
        coverPreview.style.display = "none";
        return;
      }
      if (cover.size > 15 * 1024 * 1024) {
        status.textContent = "The cover image must be 15 MB or smaller.";
        coverInput.value = "";
        coverPreview.style.display = "none";
        return;
      }
      const img = document.createElement("img");
      img.alt = "Front cover preview";
      img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;";
      img.src = URL.createObjectURL(cover);
      img.onload = () => URL.revokeObjectURL(img.src);
      coverPreview.appendChild(img);
      status.textContent = "";
    };

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
      const coverFile = coverInput.files && coverInput.files[0];
      if (!title) { status.textContent = "Enter the book title."; panel.querySelector("#b2pTitle").focus(); return; }
      if (!Number.isInteger(price) || price <= 0) { status.textContent = "Enter a whole-number price in TZS."; panel.querySelector("#b2pPrice").focus(); return; }
      if (coverFile && (!coverFile.type || !coverFile.type.startsWith("image/"))) { status.textContent = "Please choose a valid front cover image."; return; }
      if (coverFile && coverFile.size > 15 * 1024 * 1024) { status.textContent = "The cover image must be 15 MB or smaller."; return; }
      if (!file) { status.textContent = "Choose a PDF file first."; return; }
      if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) { status.textContent = "Only PDF files are accepted."; return; }
      if (file.size > 50 * 1024 * 1024) { status.textContent = "This PDF is over the 50 MB limit."; return; }

      publish.disabled = true; publish.style.opacity = ".65"; status.textContent = coverFile ? "Preparing the front cover…" : "Using the first page of your PDF as the book cover…";
      let path = "";
      let frontCover = "";
      let published = false;
      try {
        frontCover = coverFile ? await compressFrontCover(coverFile) : await coverFromPdfFirstPage(file);
        if (!frontCover) throw new Error("A separate front-cover image is needed because the first PDF page does not look like a cover. Upload the cover image and publish again.");
        status.textContent = "Preparing secure upload…";
        const session = await ensureHeavensAnonymousSession();
        if (!session || !session.user || !session.user.id) throw new Error("Please reconnect before publishing.");
        const random = window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2);
        path = session.user.id + "/" + random + ".pdf";
        const uploaded = await heavensSupabase.storage.from("paid-book-pdfs").upload(path, file, { contentType: "application/pdf", upsert: false });
        if (uploaded.error) throw uploaded.error;

        status.textContent = "File uploaded securely. Publishing bookstore listing…";
        const inserted = await heavensSupabase.from("heavens_books").insert({
          title, category, price, currency: "TZS", front_cover: frontCover, back_cover: null,
          contents: "", chapters: [], author_id: session.user.id, active: true, payment_required: true, pdf_path: path
        }).select("id,title,category,price,currency,front_cover,pdf_path,payment_required,created_at").single();
        if (inserted.error) throw inserted.error;
        published = true;

        const row = inserted.data;
        const book = {
          id: "HB-SERVER-" + row.id, supabaseId: row.id, title: row.title,
          category: row.category, price: Number(row.price), currency: row.currency || "TZS",
          contents: "", frontCover: row.front_cover || frontCover, backCover: "", pdfPath: row.pdf_path,
          chapters: [], paymentRequired: row.payment_required !== false, isAuthor: true,
          date: row.created_at ? new Date(row.created_at).toLocaleDateString() : ""
        };
        if (typeof markBookPaid === "function") {
          try { markBookPaid(book); } catch (storageError) { console.warn("Could not cache author preview state:", storageError); }
        }
        status.textContent = "Published successfully. Your PDF is now listed in Explore.";
        publish.textContent = "PUBLISHED";
        setTimeout(close, 1200);
      } catch (error) {
        console.error("Book to PDF publish failed:", error);
        if (path && !published) {
          try { await heavensSupabase.storage.from("paid-book-pdfs").remove([path]); }
          catch (cleanupError) { console.warn("Could not clean up incomplete PDF upload:", cleanupError); }
        }
        status.textContent = error && error.message ? error.message : "Could not publish this PDF. Please try again.";
        publish.disabled = false; publish.style.opacity = "1";
      }
    };
  };


  async function coverFromPdfFirstPage(file) {
    const pdfjs = await loadPdfJs();
    const buffer = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    try {
      const page = await doc.getPage(1);
      const textContent = await page.getTextContent();
      const textItems = Array.isArray(textContent.items) ? textContent.items : [];
      const characterCount = textItems.reduce((sum, item) => sum + String(item.str || "").trim().length, 0);
      const operators = await page.getOperatorList();
      const imageOps = new Set([
        pdfjs.OPS.paintImageXObject,
        pdfjs.OPS.paintInlineImageXObject,
        pdfjs.OPS.paintJpegXObject,
        pdfjs.OPS.paintImageMaskXObject,
        pdfjs.OPS.paintImageMaskXObjectGroup
      ].filter(value => value !== undefined));
      const hasImage = Array.isArray(operators.fnArray) && operators.fnArray.some(op => imageOps.has(op));
      // A cover usually has a sparse title/layout or a large image. Dense first pages are treated as body text.
      const likelyCover = (textItems.length <= 28 && characterCount > 0 && characterCount <= 520)
        || (hasImage && textItems.length <= 55 && characterCount <= 900);
      if (!likelyCover) return "";
      const original = page.getViewport({ scale: 1 });
      const scale = Math.min(1.25, 900 / Math.max(1, original.width));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("Cover image processing is unavailable.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      return canvas.toDataURL("image/jpeg", 0.82);
    } finally {
      try { await doc.destroy(); } catch (_) {}
    }
  }

  let pdfJsLoadPromise = null;
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (pdfJsLoadPromise) return pdfJsLoadPromise;
    pdfJsLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      script.async = true;
      script.onload = () => {
        if (!window.pdfjsLib) return reject(new Error("The book reader library did not load."));
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        resolve(window.pdfjsLib);
      };
      script.onerror = () => reject(new Error("Could not load the interactive book reader. Check your internet connection and try again."));
      document.head.appendChild(script);
    });
    return pdfJsLoadPromise;
  }

  window.openPaidPdfReader = async function openPaidPdfReader(book) {
    const existing = document.getElementById("heavensReader");
    if (existing) existing.remove();
    let reader = null;
    let resizeHandler = null;
    let closed = false;
    try {
      const session = await ensureHeavensAnonymousSession();
      if (!session || !session.access_token) throw new Error("Please reconnect before opening this book.");
      const result = await heavensSupabase.functions.invoke("book-pdf-access", {
        body: { book_id: String(book.supabaseId || book.id || "") }
      });
      if (result.error || !result.data || !result.data.success || !result.data.url) {
        console.error("Protected PDF access failed:", result.error || result.data);
        throw new Error((result.data && result.data.error) || "Payment must be confirmed by the server before this book can open.");
      }

      const pdfjs = await loadPdfJs();
      if (closed) return;
      reader = document.createElement("div");
      reader.id = "heavensReader";
      reader.innerHTML = `
        <div class="hr-head">
          <button class="hr-back" type="button" aria-label="Close book">×</button>
          <div class="hr-name"></div>
          <div class="hr-counter" id="hrTopCount">1 / 1</div>
        </div>
        <div class="hr-stage" id="hrStage">
          <div class="hr-book" id="hrBook"></div>
          <div class="hr-controls">
            <button class="hr-nav" id="hrPrev" type="button" aria-label="Previous page">‹</button>
            <div class="hr-page-count" id="hrPageCount">1 / 1</div>
            <button class="hr-nav" id="hrNext" type="button" aria-label="Next page">›</button>
          </div>
        </div>`;
      reader.querySelector(".hr-name").textContent = String(book.title || "Untitled Book");
      document.body.appendChild(reader);
      document.body.style.overflow = "hidden";
      if (typeof heavensNormalizeViewport === "function") heavensNormalizeViewport();

      const bookEl = reader.querySelector("#hrBook");
      const stage = reader.querySelector("#hrStage");
      const pages = [];
      const rendered = new Map();
      let currentPage = 0, turning = false, turnTimer = null, pdfDocument = null;

      function addCoverPage() {
        const page = document.createElement("article");
        page.className = "hr-page hr-page-cover-wrap";
        page.style.display = "none";
        page.innerHTML = '<div class="hr-page-inner hr-cover-inner"></div>';
        const inner = page.querySelector(".hr-page-inner");
        const img = document.createElement("img");
        img.className = "hr-page-cover";
        img.alt = "Front cover";
        img.src = String(book.frontCover || "");
        img.onerror = () => {
          inner.innerHTML = "";
          inner.classList.add("hr-cover-fallback");
          const title = document.createElement("div");
          title.className = "hr-cover-fallback-title";
          title.textContent = String(book.title || "Untitled Book");
          inner.appendChild(title);
        };
        inner.appendChild(img);
        bookEl.appendChild(page);
        pages.push({ element: page, kind: "cover", pdfPage: null });
      }

      function addPdfPage(number) {
        const page = document.createElement("article");
        page.className = "hr-page hr-pdf-page";
        page.style.display = "none";
        page.innerHTML = '<div class="hr-page-inner"><canvas aria-label="Book page ' + number + '"></canvas><div class="hr-pdf-loading">Loading page…</div></div>';
        bookEl.appendChild(page);
        pages.push({ element: page, kind: "pdf", pdfPage: number });
      }

      function updateReader() {
        pages.forEach((item, index) => {
          item.element.style.display = index === currentPage ? "block" : "none";
          item.element.style.visibility = "visible";
          item.element.style.zIndex = index === currentPage ? "20" : "1";
          item.element.classList.remove("is-turning-next", "is-turning-prev");
        });
        const label = (currentPage + 1) + " / " + pages.length;
        reader.querySelector("#hrPageCount").textContent = label;
        reader.querySelector("#hrTopCount").textContent = label;
        reader.querySelector("#hrPrev").disabled = currentPage === 0;
        reader.querySelector("#hrNext").disabled = currentPage === pages.length - 1;
        renderCurrentPdfPage();
      }

      async function renderCurrentPdfPage() {
        const item = pages[currentPage];
        if (!item || item.kind !== "pdf" || rendered.has(item.pdfPage) || !pdfDocument) return;
        const pageEl = item.element;
        const canvas = pageEl.querySelector("canvas");
        const loading = pageEl.querySelector(".hr-pdf-loading");
        try {
          const pdfPage = await pdfDocument.getPage(item.pdfPage);
          if (closed || !pageEl.isConnected) return;
          const base = pdfPage.getViewport({ scale: 1 });
          const availableWidth = Math.max(240, stage.clientWidth - 24);
          const availableHeight = Math.max(240, stage.clientHeight - 90);
          const fitScale = Math.min(availableWidth / base.width, availableHeight / base.height);
          const outputScale = Math.min(window.devicePixelRatio || 1, 2);
          const viewport = pdfPage.getViewport({ scale: Math.max(0.35, fitScale * outputScale) });
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          canvas.style.width = Math.max(1, Math.round(viewport.width / outputScale)) + "px";
          canvas.style.height = Math.max(1, Math.round(viewport.height / outputScale)) + "px";
          await pdfPage.render({ canvasContext: canvas.getContext("2d", { alpha: false }), viewport }).promise;
          if (loading) loading.remove();
          rendered.set(item.pdfPage, true);
        } catch (error) {
          console.error("PDF page render failed:", error);
          if (loading) loading.textContent = "This page could not be rendered. Try turning away and back.";
        }
      }

      function turnTo(nextPage, direction) {
        if (turning || nextPage < 0 || nextPage >= pages.length || nextPage === currentPage) return;
        turning = true;
        const old = pages[currentPage].element, next = pages[nextPage].element;
        next.style.display = "block"; next.style.zIndex = "19"; old.style.zIndex = "20";
        old.classList.add(direction > 0 ? "is-turning-next" : "is-turning-prev");
        clearTimeout(turnTimer);
        turnTimer = setTimeout(() => { currentPage = nextPage; turning = false; updateReader(); }, 560);
      }
      const nextPage = () => turnTo(currentPage + 1, 1);
      const prevPage = () => turnTo(currentPage - 1, -1);
      reader.querySelector("#hrNext").onclick = event => { event.stopPropagation(); nextPage(); };
      reader.querySelector("#hrPrev").onclick = event => { event.stopPropagation(); prevPage(); };

      const closeReader = () => {
        closed = true;
        clearTimeout(turnTimer);
        if (resizeHandler) window.removeEventListener("resize", resizeHandler);
        if (pdfDocument) { try { pdfDocument.destroy(); } catch (_) {} }
        if (reader) reader.remove();
        document.body.style.overflow = "";
        if (typeof heavensNormalizeViewport === "function") heavensNormalizeViewport();
      };
      reader.querySelector(".hr-back").onclick = event => { event.stopPropagation(); closeReader(); };
      reader.tabIndex = 0;
      reader.focus();
      reader.addEventListener("keydown", event => {
        if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); nextPage(); }
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); prevPage(); }
        else if (event.key === "Escape") { event.preventDefault(); closeReader(); }
      });
      let startX = 0, startY = 0;
      reader.addEventListener("touchstart", event => { const touch = event.changedTouches[0]; startX = touch.screenX; startY = touch.screenY; }, { passive: true });
      reader.addEventListener("touchend", event => {
        const touch = event.changedTouches[0], dx = touch.screenX - startX, dy = touch.screenY - startY;
        if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.2) dx < 0 ? nextPage() : prevPage();
      }, { passive: true });
      reader.addEventListener("contextmenu", event => event.preventDefault());
      reader.addEventListener("copy", event => event.preventDefault());
      reader.addEventListener("cut", event => event.preventDefault());
      reader.addEventListener("dragstart", event => event.preventDefault());
      resizeHandler = () => {
        rendered.clear();
        pages.forEach(item => {
          if (item.kind === "pdf") {
            const canvas = item.element.querySelector("canvas");
            if (canvas) { canvas.width = 0; canvas.height = 0; }
            const loading = item.element.querySelector(".hr-pdf-loading");
            if (loading && !loading.isConnected) item.element.querySelector(".hr-page-inner").appendChild(loading);
          }
        });
        renderCurrentPdfPage();
      };
      window.addEventListener("resize", resizeHandler);

      const loadingPage = document.createElement("div");
      loadingPage.className = "hr-pdf-loading";
      loadingPage.textContent = "Opening your book…";
      bookEl.appendChild(loadingPage);
      try {
        const task = pdfjs.getDocument({ url: result.data.url, withCredentials: false });
        pdfDocument = await task.promise;
      } finally {
        loadingPage.remove();
      }
      if (closed) return;
      if (book.frontCover) addCoverPage();
      else {
        const titlePage = document.createElement("article");
        titlePage.className = "hr-page";
        titlePage.style.display = "none";
        titlePage.innerHTML = '<div class="hr-page-inner"><div class="hr-page-subtitle">I|ONE LIBRARY</div><h1 class="hr-page-title"></h1><div class="hr-page-rule"></div></div>';
        titlePage.querySelector(".hr-page-title").textContent = String(book.title || "Untitled Book");
        bookEl.appendChild(titlePage);
        pages.push({ element: titlePage, kind: "cover", pdfPage: null });
      }
      for (let number = 1; number <= pdfDocument.numPages; number++) addPdfPage(number);
      updateReader();
    } catch (error) {
      console.error("Could not open interactive PDF book:", error);
      if (reader) reader.remove();
      document.body.style.overflow = "";
      if (typeof heavensNormalizeViewport === "function") heavensNormalizeViewport();
      alert(error && error.message ? error.message : "Could not open this book. Please try again.");
    }
  };
})();