export default function Compass() {
 return <svg viewBox="0 0 300 300" role="img" aria-label="A friendly reading compass" className="compass">
 <circle cx="150" cy="150" r="108" fill="#f6d58a" stroke="#634532" strokeWidth="8"/>
 <circle cx="150" cy="150" r="88" fill="#fff9ec" stroke="#d7ad60" strokeWidth="4"/>
 <path d="M150 57L174 150L150 243L126 150Z" fill="#ba4c3e"/>
 <path d="M57 150L150 126L243 150L150 174Z" fill="#dbad62"/>
 <circle cx="150" cy="150" r="27" fill="#fff9ec" stroke="#634532" strokeWidth="3"/>
 <circle cx="141" cy="145" r="3" fill="#634532"/><circle cx="159" cy="145" r="3" fill="#634532"/>
 <path d="M139 155Q150 167 161 155" fill="none" stroke="#634532" strokeWidth="3" strokeLinecap="round"/>
 </svg>;
}
