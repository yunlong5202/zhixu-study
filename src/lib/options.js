// Keep stored answers as original option indices. A stable per-question display
// order prevents sequential source data from revealing the answer pattern and
// keeps a resumed paper's letters consistent across refreshes.
export function displayedOptions(question) {
  let seed=2166136261;
  for(const ch of question.id)seed=Math.imul(seed^ch.charCodeAt(0),16777619)>>>0;
  const random=()=>{
    seed=(seed+0x6d2b79f5)>>>0;
    let n=Math.imul(seed^(seed>>>15),1|seed);
    n^=n+Math.imul(n^(n>>>7),61|n);
    return ((n^(n>>>14))>>>0)/4294967296;
  };
  const options=question.options.map((text,index)=>({text,index}));
  for(let i=options.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[options[i],options[j]]=[options[j],options[i]];}
  return options;
}

export function answerLetter(question) {
  return String.fromCharCode(65+displayedOptions(question).findIndex(option=>option.index===question.answer));
}
