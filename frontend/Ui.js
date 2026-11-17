/* ===================================================
   UI LAYER — handles modals, the sliding doc panel,
   and small visual niceties. Pure presentation logic;
   never duplicates or interferes with app.js network calls.
=================================================== */

(function () {

  /* ---------- MODALS ---------- */

  const modalMap = {
    summaryBtn: "summaryModal",
    insightsBtn: "insightsModal",
    historyBtn: "historyModal",
    searchNavBtn: "searchModal",
    compareNavBtn: "compareModal"
  };

  function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add("show");
  }

  function closeModal(el) {
    el.classList.remove("show");
  }

  Object.keys(modalMap).forEach((btnId) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener("click", () => openModal(modalMap[btnId]));
  });

  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal(overlay);
    });
    overlay.querySelectorAll("[data-close]").forEach((btn) => {
      btn.addEventListener("click", () => closeModal(overlay));
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal-overlay.show").forEach(closeModal);
    }
  });

  /* ---------- FILE NAME TAG ---------- */

  const pdfFile = document.getElementById("pdfFile");
  const fileNameTag = document.getElementById("fileNameTag");

  if (pdfFile && fileNameTag) {
    pdfFile.addEventListener("change", () => {
      fileNameTag.textContent =
        pdfFile.files && pdfFile.files[0]
          ? pdfFile.files[0].name
          : "Choose a PDF…";
    });
  }

  /* ---------- RIGHT DOC PANEL: open once documents exist ---------- */

  const documentsList = document.getElementById("documentsList");
  const docPanel = document.getElementById("docPanel");

  if (documentsList && docPanel) {
    const observer = new MutationObserver(() => {
      if (documentsList.children.length > 0) {
        docPanel.classList.add("open");
      } else {
        docPanel.classList.remove("open");
      }
    });
    observer.observe(documentsList, { childList: true });

    // active-state highlight on document chip click (delegated,
    // additive to app.js's own onclick navigation handler)
    documentsList.addEventListener("click", (e) => {
      const item = e.target.closest(".document-item");
      if (!item) return;
      documentsList
        .querySelectorAll(".document-item.active")
        .forEach((el) => el.classList.remove("active"));
      item.classList.add("active");
    });
  }

  /* ---------- CHAT EMPTY STATE ---------- */

  const chatEmptyState = document.getElementById("chatEmptyState");

  function dismissEmptyState() {
    if (chatEmptyState && chatEmptyState.parentNode) {
      chatEmptyState.remove();
    }
  }

  const sendBtn = document.getElementById("sendBtn");
  const chatInput = document.getElementById("chatInput");

  if (sendBtn) sendBtn.addEventListener("click", () => {
    if (chatInput && chatInput.value.trim()) dismissEmptyState();
  });

  if (chatInput) chatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && chatInput.value.trim()) dismissEmptyState();
  });

  /* ---------- MOBILE TAB SWITCHER ---------- */
  const tabChatBtn = document.getElementById("tabChatBtn");
  const tabDocBtn = document.getElementById("tabDocBtn");
  const mobileBackChatBtn = document.getElementById("mobileBackChatBtn");
  const workspaceEl = document.querySelector(".workspace");

  function showChat() {
    if (tabChatBtn) tabChatBtn.classList.add("active");
    if (tabDocBtn) tabDocBtn.classList.remove("active");
    if (workspaceEl) {
      workspaceEl.classList.remove("show-mobile-doc");
      workspaceEl.classList.add("show-mobile-chat");
    }
  }

  function showDoc() {
    if (tabDocBtn) tabDocBtn.classList.add("active");
    if (tabChatBtn) tabChatBtn.classList.remove("active");
    if (workspaceEl) {
      workspaceEl.classList.remove("show-mobile-chat");
      workspaceEl.classList.add("show-mobile-doc");
    }
  }

  if (tabChatBtn) tabChatBtn.addEventListener("click", showChat);
  if (tabDocBtn) tabDocBtn.addEventListener("click", showDoc);
  if (mobileBackChatBtn) mobileBackChatBtn.addEventListener("click", showChat);

})();