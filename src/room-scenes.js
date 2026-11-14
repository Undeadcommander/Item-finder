// Layered, color-inheriting room scenes match the default room card artwork.
const background = `
  <ellipse cx="182" cy="149" rx="125" ry="11" fill="currentColor" opacity=".08"/>
  <path d="M48 137h264" stroke="currentColor" opacity=".12"/>
  <path d="M59 128V34h65v94" stroke="currentColor" opacity=".22" stroke-width="2"/>
  <path d="M62 37h59v67H62z" fill="white" opacity=".32"/>
  <path d="M92 34v94M59 78h65" stroke="currentColor" opacity=".16" stroke-width="2"/>
  <rect x="175" y="30" width="39" height="29" rx="2" stroke="currentColor" opacity=".23" stroke-width="2"/>
  <path d="m181 52 9-10 6 5 6-6 7 11" stroke="currentColor" opacity=".3"/>
  <path d="M76 139v-27m0 9c-20-2-21-19-21-19 19-1 22 13 21 19Zm0-11c16-4 17-21 17-21-19 2-19 13-17 21Z" stroke="currentColor" opacity=".45" stroke-width="2"/>
  <path d="M65 129h23l-4 17H69z" fill="currentColor" opacity=".36"/>
`;

const scenes = {
  living: `
    <rect x="119" y="86" width="145" height="48" rx="12" fill="currentColor" opacity=".29"/>
    <rect x="110" y="105" width="163" height="34" rx="9" fill="currentColor" opacity=".42"/>
    <rect x="123" y="91" width="59" height="28" rx="7" fill="white" opacity=".4"/>
    <rect x="190" y="91" width="59" height="28" rx="7" fill="white" opacity=".4"/>
    <path d="M123 139v8m137-8v8" stroke="currentColor" stroke-width="4" opacity=".5"/>
    <path d="M289 139V70m-17 0h34l-8-27h-18z" fill="currentColor" stroke="currentColor" opacity=".36"/>
    <path d="M281 140h17" stroke="currentColor" stroke-width="3" opacity=".45"/>
  `,
  bedroom: `
    <rect x="116" y="73" width="143" height="60" rx="9" fill="currentColor" opacity=".27"/>
    <rect x="120" y="96" width="135" height="40" rx="7" fill="white" opacity=".4"/>
    <rect x="125" y="84" width="54" height="24" rx="7" fill="white" opacity=".5"/>
    <rect x="194" y="84" width="54" height="24" rx="7" fill="white" opacity=".5"/>
    <path d="M114 111h147v30H114z" fill="currentColor" opacity=".38"/>
    <path d="M123 141v7m129-7v7M116 117h143" stroke="currentColor" stroke-width="3" opacity=".3"/>
    <rect x="271" y="111" width="33" height="31" rx="3" fill="currentColor" opacity=".25"/>
    <path d="M284 124h8m-16 18v6m23-6v6M288 110V92" stroke="currentColor" stroke-width="2" opacity=".45"/>
    <path d="M274 92h28l-6-21h-16z" fill="currentColor" opacity=".35"/>
  `,
  kitchen: `
    <rect x="132" y="85" width="171" height="59" rx="3" fill="currentColor" opacity=".28"/>
    <rect x="128" y="82" width="179" height="7" rx="3" fill="currentColor" opacity=".45"/>
    <path d="M184 90v52m61-52v52M145 101h23m28 0h34m27 0h31" stroke="currentColor" stroke-width="2" opacity=".35"/>
    <rect x="192" y="109" width="45" height="27" rx="3" fill="currentColor" opacity=".25"/>
    <rect x="197" y="114" width="35" height="17" rx="2" fill="white" opacity=".3"/>
    <path d="M145 82V69q0-12 13-8" stroke="currentColor" stroke-width="3" opacity=".5"/>
    <path d="M140 84h28m31-5h31" stroke="currentColor" stroke-width="3" opacity=".3"/>
    <rect x="240" y="31" width="63" height="37" rx="3" fill="currentColor" opacity=".22"/>
    <path d="M271 32v35m-7-18v7m14-7v7" stroke="currentColor" stroke-width="2" opacity=".3"/>
    <path d="M271 82V67h18v15" fill="white" opacity=".5"/>
    <path d="m275 67-3-14m8 14 4-16" stroke="currentColor" stroke-width="2" opacity=".4"/>
  `,
  office: `
    <rect x="110" y="102" width="190" height="8" rx="3" fill="currentColor" opacity=".45"/>
    <path d="M120 110v37m169-37v37" stroke="currentColor" stroke-width="5" opacity=".35"/>
    <rect x="157" y="65" width="78" height="35" rx="4" fill="currentColor" opacity=".35"/>
    <rect x="162" y="70" width="68" height="25" rx="2" fill="white" opacity=".4"/>
    <path d="M196 100v4m-16 0h32" stroke="currentColor" stroke-width="3" opacity=".45"/>
    <rect x="170" y="118" width="52" height="22" rx="8" fill="currentColor" opacity=".32"/>
    <path d="M196 140v9m-18 0h36" stroke="currentColor" stroke-width="3" opacity=".4"/>
    <path d="M263 102V72l13-11m-7-4 16 10 3-12-10-6z" stroke="currentColor" fill="currentColor" opacity=".35" stroke-width="2"/>
    <path d="M124 98h24m-24-5h19" stroke="currentColor" stroke-width="4" opacity=".3"/>
    <path d="M244 35h57" stroke="currentColor" stroke-width="3" opacity=".2"/>
    <path d="M251 33V17h9v16m5 0V13h10v20m6 0-3-15 9-2 3 17" stroke="currentColor" fill="currentColor" opacity=".25"/>
  `,
};

export function roomScene(value) {
  if (!Object.hasOwn(scenes, value)) return "";
  return `<svg class="room-art" viewBox="0 0 360 170" fill="none" aria-hidden="true" stroke-linecap="round" stroke-linejoin="round">${background}${scenes[value]}</svg>`;
}
