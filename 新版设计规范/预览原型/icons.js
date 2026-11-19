// 预览用图标：线性 1.75px 圆头 + 局部填色（.f 浅湖面）+ 至多一处日光黄（.s）
const S = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">
<symbol id="i-home" viewBox="0 0 24 24"><path class="f main" d="M4 11l8-6.5 8 6.5v8a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z"/></symbol>
<symbol id="i-learn" viewBox="0 0 24 24"><path class="f main" d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5v13c-2.500-1-5.500-1-8 .5-2.500-1.500-5.500-1.500-8-.5z"/><path d="M12 6v13"/></symbol>
<symbol id="i-practice" viewBox="0 0 24 24"><rect class="f main" x="3.500" y="4.500" width="17" height="15" rx="3"/><path d="M9.500 9.500L7 12l2.500 2.500M14.500 9.500L17 12l-2.500 2.500"/></symbol>
<symbol id="i-cards" viewBox="0 0 24 24"><rect class="f main" x="6" y="3.500" width="14" height="14" rx="3"/><path d="M4 8v9.500a3 3 0 0 0 3 3h9"/></symbol>
<symbol id="i-me" viewBox="0 0 24 24"><circle class="f main" cx="12" cy="8.500" r="3.500"/><path d="M5 20c.5-3.500 3.500-5.500 7-5.500s6.500 2 7 5.500"/></symbol>
<symbol id="i-search" viewBox="0 0 24 24"><circle class="f" cx="10.500" cy="10.500" r="6"/><path d="M15 15l5 5"/></symbol>
<symbol id="i-back" viewBox="0 0 24 24"><path d="M14.500 5.500L8 12l6.500 6.500"/></symbol>
<symbol id="i-bookmark" viewBox="0 0 24 24"><path class="f" d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z"/></symbol>
<symbol id="i-more" viewBox="0 0 24 24"><circle cx="5.500" cy="12" r="1.200"/><circle cx="12" cy="12" r="1.200"/><circle cx="18.500" cy="12" r="1.200"/></symbol>
<symbol id="i-chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></symbol>
<symbol id="i-down" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></symbol>
<symbol id="i-flask" viewBox="0 0 24 24"><path class="f" d="M9.500 4h5M10.500 4v5.500L5.500 18a1.500 1.500 0 0 0 1.300 2.300h10.400a1.500 1.500 0 0 0 1.300-2.300l-5-8.500V4"/><circle class="s" cx="12" cy="16" r="1.600"/></symbol>
<symbol id="i-project" viewBox="0 0 24 24"><rect class="f" x="3.500" y="7.500" width="17" height="12" rx="2.500"/><path d="M9 7.500V6a1.500 1.500 0 0 1 1.500-1.500h3A1.500 1.500 0 0 1 15 6v1.500M3.500 12.500h17"/><circle class="s" cx="12" cy="12.500" r="1.500"/></symbol>
<symbol id="i-copy" viewBox="0 0 24 24"><rect class="f" x="8.500" y="8.500" width="11" height="11" rx="2.500"/><path d="M15.500 8.500V6.500a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/></symbol>
<symbol id="i-play" viewBox="0 0 24 24"><path class="f" d="M8 5.500v13l11-6.500z"/></symbol>
<symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12.500l4.500 4.500L19 7.500"/></symbol>
<symbol id="i-wrap" viewBox="0 0 24 24"><path d="M4 7h16M4 12h12a3 3 0 0 1 0 6h-4M14 15.500L11.500 18l2.500 2.500M4 17h4"/></symbol>
</svg>`;
document.body.insertAdjacentHTML("afterbegin", S);
document.querySelectorAll("[data-i]").forEach((el) => {
  el.outerHTML = `<svg class="ico ${el.getAttribute("class") || ""}" aria-hidden="true"><use href="#i-${el.dataset.i}"/></svg>`;
});
