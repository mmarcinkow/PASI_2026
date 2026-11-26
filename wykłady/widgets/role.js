/* Dydaktyczny ReFeX z NMF i obciętym SVD. */
(() => {
  'use strict';
  const graph = {
    nodes: [
      [90,100],[155,70],[165,155],[100,205],
      [655,100],[590,70],[580,155],[645,205],
      [285,200],[450,200],[265,90],[270,310],
      [455,80],[490,310],[595,350],[705,370],
      [95,365],[165,365],
    ].map(([x,y],i)=>({id:i,label:String(i+1),x,y})),
    edges: [[0,1],[0,2],[0,3],[1,2],[1,3],[2,3],
      [4,5],[4,6],[4,7],[5,6],[5,7],[6,7],
      [3,8],[8,9],[9,6],[8,10],[8,11],[9,12],[9,13],[13,14],[14,15],[16,17]],
  };
  const smallGraph = {nodes:'ABCDEFG'.split('').map((label,id)=>({id,label})),
    edges:[[0,1],[1,2],[2,0],[2,3],[2,4],[3,4],[3,5],[4,6],[5,6]]};
  const baseFeatures = [
    {key:'degree',label:'Stopień d',short:'d'},
    {key:'ego',label:'Krawędzie w ego-necie e',short:'e'},
    {key:'boundary',label:'Krawędzie wychodzące z ego-netu b',short:'b'},
    {key:'triangles',label:'Liczba trójkątów t',short:'t'},
    {key:'clustering',label:'Współczynnik skupienia C',short:'C'},
  ];
  function neighbors(g) {
    const adj=Array.from({length:g.nodes.length},()=>[]);
    for(const [u,v] of g.edges){adj[u].push(v);adj[v].push(u);}
    return adj;
  }
  function baseValues(g) {
    const adj=neighbors(g), sets=adj.map(xs=>new Set(xs));
    return g.nodes.map((_,v)=>{
      const ego=new Set([v,...adj[v]]);
      let inner=0,boundary=0,triangles=0;
      for(const [u,w] of g.edges){
        if(ego.has(u)&&ego.has(w))inner++;
        if(ego.has(u)!==ego.has(w))boundary++;
        if(sets[v].has(u)&&sets[v].has(w))triangles++;
      }
      const degree=adj[v].length;
      return {degree,ego:inner,boundary,triangles,
        clustering:degree>1?2*triangles/(degree*(degree-1)):0};
    });
  }
  function aggregate(values, adj, operation) {
    if(!['mean','sum'].includes(operation))throw new RangeError('Nieznana agregacja.');
    return adj.map(xs=>{
      const sum=xs.reduce((a,v)=>a+values[v],0);
      return operation==='sum'?sum:xs.length?sum/xs.length:0;
    });
  }
  function featureMatrix(g, keys, depth=0, aggregation='mean') {
    if(!keys.length||keys.some(k=>!baseFeatures.some(f=>f.key===k))||new Set(keys).size!==keys.length)
      throw new RangeError('Wybierz niepusty zbiór różnych cech.');
    if(!Number.isInteger(depth)||depth<0||depth>3)throw new RangeError('Głębokość: od 0 do 3.');
    if(!['mean','sum','both'].includes(aggregation))throw new RangeError('Nieznana agregacja.');
    const base=baseValues(g),adj=neighbors(g),columns=[],vectors=[];
    for(const key of keys){
      const info=baseFeatures.find(f=>f.key===key);
      columns.push({key,name:info.short,description:info.label,depth:0});
      vectors.push(base.map(row=>row[key]));
    }
    let frontier=columns.map((_,i)=>i);
    for(let level=1;level<=depth;level++){
      const next=[];
      for(const parent of frontier){
        for(const operation of aggregation==='both'?['mean','sum']:[aggregation]){
          const name=`${operation==='mean'?'śr':'sum'}(${columns[parent].name})`;
          next.push(columns.length);
          columns.push({name,parent,operation,depth:level});
          vectors.push(aggregate(vectors[parent],adj,operation));
        }
      }
      frontier=next;
    }
    return {X:g.nodes.map((_,v)=>vectors.map(xs=>xs[v])),columns};
  }
  function degreeAggregationMatrix(g){
    const adj=neighbors(g),vectors=[baseValues(g).map(row=>row.degree)];
    const columns=[
      {name:'d',description:'Stopień d',key:'degree',depth:0},
      {name:'Ad',description:'Suma stopni sąsiadów',operation:'sum',operators:'A',parent:0,depth:1},
      {name:'Md',description:'Średnia stopni sąsiadów',operation:'mean',operators:'M',parent:0,depth:1},
      {name:'A²d',description:'Suma sum stopni u sąsiadów',operation:'sum',operators:'AA',parent:1,depth:2},
      {name:'M²d',description:'Średnia średnich stopni u sąsiadów',operation:'mean',operators:'MM',parent:2,depth:2},
      {name:'AMd',description:'Suma średnich stopni u sąsiadów',operation:'sum',operators:'AM',parent:2,depth:2},
      {name:'MAd',description:'Średnia sum stopni u sąsiadów',operation:'mean',operators:'MA',parent:1,depth:2},
    ];
    for(const column of columns.slice(1))
      vectors.push(aggregate(vectors[column.parent],adj,column.operation));
    return {X:g.nodes.map((_,v)=>vectors.map(values=>values[v])),columns};
  }
  function scaleColumns(X, enabled=true) {
    const scales=X[0].map((_,j)=>enabled?Math.max(1e-15,...X.map(row=>row[j])):1);
    for(let j=0;j<scales.length;j++)if(scales[j]<1e-14)scales[j]=1;
    return {X:X.map(row=>row.map((x,j)=>x/scales[j])),scales};
  }
  const zeros=(n,p)=>Array.from({length:n},()=>Array(p).fill(0));
  function multiply(A,B){
    const result=zeros(A.length,B[0].length);
    for(let i=0;i<A.length;i++)for(let k=0;k<B.length;k++)
      for(let j=0;j<B[0].length;j++)result[i][j]+=A[i][k]*B[k][j];
    return result;
  }
  function reconstructionError(X,Y){
    let error=0;
    for(let i=0;i<X.length;i++)for(let j=0;j<X[0].length;j++)error+=(X[i][j]-Y[i][j])**2;
    return error;
  }
  function randomGenerator(seed){
    let x=seed>>>0;
    return ()=>{x=(Math.imul(1664525,x)+1013904223)>>>0;return x/4294967296;};
  }
  function nmf(X, rank, {maxIterations=800,restarts=4,seed=29}={}){
    if(!Array.isArray(X)||!X.length||!Array.isArray(X[0])||!X[0].length||
      X.some(row=>row.length!==X[0].length||row.some(x=>!Number.isFinite(x)||x<0)))
      throw new RangeError('Macierz musi być niepusta, prostokątna i nieujemna.');
    const n=X.length,p=X[0].length;
    if(!Number.isInteger(rank)||rank<1||rank>Math.min(n,p))throw new RangeError('Niepoprawna liczba ról.');
    if(!Number.isInteger(maxIterations)||maxIterations<1||!Number.isInteger(restarts)||restarts<1)
      throw new RangeError('Niepoprawne parametry obliczeń.');
    const eps=1e-12,norm=reconstructionError(X,zeros(n,p));
    if(norm===0)return {W:zeros(n,rank),H:zeros(rank,p),error:0,relativeError:0,history:[0],iterations:0};
    let best=null;
    for(let trial=0;trial<restarts;trial++){
      const random=randomGenerator(seed+trial*104729);
      let H=Array.from({length:rank},()=>Array.from({length:p},()=>.1+random()));
      // Identyczne wiersze X zaczynają identycznie: brak sztucznego rozdzielania symetrii.
      const projection=Array.from({length:p},()=>Array.from({length:rank},()=>.1+random()));
      let W=multiply(X,projection).map(row=>row.map(x=>x/p+.01));
      const history=[reconstructionError(X,multiply(W,H))];
      let previous=history[0],iterations=0;
      for(let step=0;step<maxIterations;step++){
        const wtx=zeros(rank,p),wtw=zeros(rank,rank);
        for(let i=0;i<n;i++)for(let k=0;k<rank;k++){
          for(let j=0;j<p;j++)wtx[k][j]+=W[i][k]*X[i][j];
          for(let l=0;l<rank;l++)wtw[k][l]+=W[i][k]*W[i][l];
        }
        const denH=multiply(wtw,H);
        for(let k=0;k<rank;k++)for(let j=0;j<p;j++)H[k][j]*=wtx[k][j]/Math.max(eps,denH[k][j]);
        const xht=zeros(n,rank),hht=zeros(rank,rank);
        for(let k=0;k<rank;k++)for(let j=0;j<p;j++){
          for(let i=0;i<n;i++)xht[i][k]+=X[i][j]*H[k][j];
          for(let l=0;l<rank;l++)hht[k][l]+=H[k][j]*H[l][j];
        }
        const denW=multiply(W,hht);
        for(let i=0;i<n;i++)for(let k=0;k<rank;k++)W[i][k]*=xht[i][k]/Math.max(eps,denW[i][k]);
        iterations=step+1;
        if(iterations%25===0||iterations===maxIterations){
          const error=reconstructionError(X,multiply(W,H));history.push(error);
          if(error<1e-16*norm||Math.abs(previous-error)<1e-10*norm)break;
          previous=error;
        }
      }
      const error=reconstructionError(X,multiply(W,H));
      if(!best||error<best.error)best={W,H,error,history,iterations};
    }
    best.relativeError=Math.sqrt(best.error/norm);
    return best;
  }
  function truncatedSvd(X, rank){
    if(!Array.isArray(X)||!X.length||!Array.isArray(X[0])||!X[0].length||
      X.some(row=>!Array.isArray(row)||row.length!==X[0].length||row.some(x=>!Number.isFinite(x))))
      throw new RangeError('Macierz musi być niepusta, prostokątna i skończona.');
    const n=X.length,p=X[0].length;
    if(!Number.isInteger(rank)||rank<1||rank>Math.min(n,p))
      throw new RangeError('Niepoprawna liczba składników.');

    // Jednostronne obroty Jacobiego ortogonalizują kolumny X bez tworzenia X^T X.
    const columns=X[0].map((_,j)=>X.map(row=>row[j]));
    const basis=zeros(p,p);
    basis.forEach((column,j)=>{column[j]=1;});
    const dot=(a,b)=>a.reduce((sum,value,i)=>sum+value*b[i],0);
    const norm=columns.reduce((sum,column)=>sum+dot(column,column),0);
    const zeroTolerance=Math.sqrt(norm)*Number.EPSILON*Math.max(n,p);
    function rotate(a,b,cos,sin){
      for(let i=0;i<a.length;i++){
        const x=a[i],y=b[i];
        a[i]=cos*x-sin*y;
        b[i]=sin*x+cos*y;
      }
    }
    for(let sweep=0;sweep<50;sweep++){
      let changed=false;
      for(let a=0;a<p;a++)for(let b=a+1;b<p;b++){
        const x=columns[a],y=columns[b];
        const xx=dot(x,x),yy=dot(y,y);
        if(Math.min(xx,yy)<=zeroTolerance**2)continue;
        const xy=dot(x,y);
        if(Math.abs(xy)<=1e-12*Math.sqrt(xx)*Math.sqrt(yy))continue;
        const tau=(yy-xx)/(2*xy);
        const tangent=(Math.sign(tau)||1)/(Math.abs(tau)+Math.hypot(1,tau));
        const cos=1/Math.hypot(1,tangent),sin=tangent*cos;
        rotate(x,y,cos,sin);
        rotate(basis[a],basis[b],cos,sin);
        changed=true;
      }
      if(!changed)break;
    }

    const order=columns.map((column,index)=>({index,sigma:Math.sqrt(dot(column,column))}))
      .sort((a,b)=>b.sigma-a.sigma).slice(0,rank);
    const W=zeros(n,rank);
    const H=order.map(({index,sigma},k)=>{
      const vector=basis[index];
      // Największa co do modułu współrzędna wektora z V ma znak dodatni.
      const pivot=vector.reduce((best,value)=>Math.abs(value)>Math.abs(best)?value:best,0);
      const sign=pivot<0?-1:1;
      if(sigma>zeroTolerance)columns[index].forEach((value,i)=>{W[i][k]=sign*value;});
      return vector.map(value=>sign*value);
    });
    const error=reconstructionError(X,multiply(W,H));
    return {W,H,error,relativeError:norm?Math.sqrt(error/norm):0};
  }
  function normalizeSignedWeights(W){
    const maximum=Math.max(...W.flat().map(Math.abs))||1;
    return W.map(row=>row.map(weight=>weight/maximum));
  }
  function dominantRole(row, signed=false){
    const values=signed?row.map(Math.abs):row;
    const maximum=Math.max(...values);
    return maximum>1e-9?values.indexOf(maximum):null;
  }
  const model={graph,smallGraph,baseFeatures,neighbors,baseValues,aggregate,featureMatrix,degreeAggregationMatrix,
    scaleColumns,multiply,reconstructionError,nmf,truncatedSvd,normalizeSignedWeights,dominantRole};
  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  if(typeof document==='undefined')return;

  const palette=['#3b70b3','#bc5751','#378572','#9471ad','#bf9333'];
  const fmt=x=>x.toLocaleString('pl-PL',{maximumFractionDigits:3});
  function el(tag,attrs={},text){
    const e=document.createElement(tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);
    if(text!==undefined)e.textContent=text;return e;
  }
  function svg(tag,attrs={},text){
    const e=document.createElementNS('http://www.w3.org/2000/svg',tag);
    for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);
    if(text!==undefined)e.textContent=text;return e;
  }
  function matrixTable(rows,columns,rowLabels,label){
    const wrap=el('div',{class:'roles-widget__table-scroll',tabindex:'0','aria-label':label});
    const table=el('table'),thead=el('thead'),tr=el('tr');tr.append(el('th',{scope:'col'},''));
    columns.forEach(c=>tr.append(el('th',{scope:'col'},c)));thead.append(tr);table.append(thead);
    const tbody=el('tbody');
    rows.forEach((row,i)=>{
      const tr=el('tr',{'data-matrix-row':i});tr.append(el('th',{scope:'row'},rowLabels[i]));
      row.forEach(value=>tr.append(el('td',{},fmt(value))));tbody.append(tr);
    });table.append(tbody);wrap.append(table);return wrap;
  }
  function mathNode(tag,children=[],attributes={}){
    const node=document.createElementNS('http://www.w3.org/1998/Math/MathML',tag);
    for(const [name,value]of Object.entries(attributes))node.setAttribute(name,value);
    if(typeof children==='string')node.textContent=children;else node.append(...children);
    return node;
  }
  function fractionParts(value){
    for(let denominator=1;denominator<=1000;denominator++){
      const numerator=Math.round(value*denominator);
      if(Math.abs(numerator/denominator-value)<1e-10)return [numerator,denominator];
    }
    return null;
  }
  function exactLabel(value){
    const parts=fractionParts(value);
    return parts?parts[1]===1?String(parts[0]):`${parts[0]}/${parts[1]}`:fmt(value);
  }
  function mathNumber(value){
    const parts=fractionParts(value);
    return parts&&parts[1]!==1?
      mathNode('mfrac',parts.map(part=>mathNode('mn',String(part)))):
      mathNode('mn',exactLabel(value));
  }
  function featureSymbol(column){
    const nodes=[];
    const operators=column.operators??'';
    if(operators.length===2&&operators[0]===operators[1]){
      nodes.push(mathNode('msup',[mathNode('mi',operators[0]),mathNode('mn','2')]));
    }else{
      for(const operator of operators)nodes.push(mathNode('mi',operator));
    }
    nodes.push(mathNode('mi','d'));
    return mathNode('mrow',nodes);
  }
  function featureCall(column,vertex){
    const symbol=featureSymbol(column);
    const nodes=column.operation?
      [mathNode('mo','('),symbol,mathNode('mo',')')]:[symbol];
    nodes.push(mathNode('mo','('),mathNode('mi',vertex,{mathvariant:'normal'}),mathNode('mo',')'));
    return mathNode('mrow',nodes);
  }
  function mathSum(terms){
    const nodes=[];
    terms.forEach((term,i)=>{if(i)nodes.push(mathNode('mo','+'));nodes.push(term);});
    return mathNode('mrow',nodes);
  }
  function equation(nodes){
    const wrap=el('div',{class:'feature-matrix__equation'});
    wrap.append(mathNode('math',[mathNode('mrow',nodes)],{displaystyle:'true'}));return wrap;
  }
  function explainAggregation(status,data,adj,vertexIndex,featureIndex){
    const {X,columns}=data,feature=columns[featureIndex],vertex=smallGraph.nodes[vertexIndex].label;
    const neighborsHere=[...adj[vertexIndex]].sort((a,b)=>a-b);
    const labels=neighborsHere.map(v=>smallGraph.nodes[v].label);
    status.replaceChildren(el('p',{},`N(${vertex}) = ${labels.length?`{${labels.join(', ')}}`:'∅'}.`));
    const equals=()=>mathNode('mo','=');
    if(!feature.operation){
      status.append(equation([featureCall(feature,vertex),equals(),
        mathNode('mo','|'),mathNode('mi','N'),mathNode('mo','('),
        mathNode('mi',vertex,{mathvariant:'normal'}),mathNode('mo',')'),mathNode('mo','|'),
        equals(),mathNumber(X[vertexIndex][featureIndex])]));
      return;
    }
    if(!neighborsHere.length){
      status.append(equation([featureCall(feature,vertex),equals(),mathNumber(0)]),
        el('p',{},'Dla wierzchołka izolowanego suma i średnia po sąsiadach są równe 0.'));
      return;
    }
    const parent=columns[feature.parent];
    let symbolic=mathSum(neighborsHere.map(v=>featureCall(parent,smallGraph.nodes[v].label)));
    let numeric=mathSum(neighborsHere.map(v=>mathNumber(X[v][feature.parent])));
    if(feature.operation==='mean'){
      symbolic=mathNode('mfrac',[symbolic,featureCall(columns[0],vertex)]);
      numeric=mathNode('mfrac',[numeric,mathNumber(neighborsHere.length)]);
    }
    const source=el('p',{},'Bierzemy wartości z kolumny ');
    source.append(mathNode('math',[featureSymbol(parent)]),` w wierszach sąsiadów wierzchołka ${vertex}.`);
    status.append(equation([featureCall(feature,vertex),equals(),symbolic]),
      equation([featureCall(feature,vertex),equals(),numeric,equals(),mathNumber(X[vertexIndex][featureIndex])]),
      source);
  }
  function initializeFeatureMatrix(root){
    if(root.dataset.ready)return;root.dataset.ready='true';
    const aggregation=root.dataset.featureMatrix==='aggregation';
    const data=aggregation?degreeAggregationMatrix(smallGraph):featureMatrix(smallGraph,['degree','ego','boundary']);
    const {X,columns:features}=data,adj=neighbors(smallGraph);
    const vertexLabels=smallGraph.nodes.map(node=>node.label);
    const table=el('table'),caption=table.createCaption();
    caption.append('Macierz cech ',el('i',{},'X'));
    const header=table.createTHead().insertRow();
    header.append(el('td',{'aria-hidden':'true'}));
    const columnHeaders=features.map(feature=>{
      const th=el('th',{scope:'col',title:feature.description});
      th.append(aggregation?mathNode('math',[featureSymbol(feature)]):
        el('i',{class:'adjacency-widget__vertex-label'},feature.name));
      header.append(th);return th;
    });
    const body=table.createTBody(),rowHeaders=[],cells=[];
    const status=el(aggregation?'div':'p',{class:'feature-matrix__status','aria-live':'polite'},
      aggregation?'Kliknij wyraz macierzy, aby zobaczyć jego obliczenie.':
        'Kliknij komórkę, aby wyróżnić wierzchołek i cechę.');
    function select(vertexIndex,featureIndex){
      rowHeaders.forEach((th,i)=>th.classList.toggle('is-source',i===vertexIndex));
      columnHeaders.forEach((th,j)=>th.classList.toggle('is-target',j===featureIndex));
      cells.forEach((values,i)=>values.forEach((cell,j)=>{
        cell.classList.toggle('is-source',i===vertexIndex);
        cell.classList.toggle('is-target',j===featureIndex);
      }));
      if(aggregation)explainAggregation(status,data,adj,vertexIndex,featureIndex);
      else{
        const vertex=vertexLabels[vertexIndex],feature=features[featureIndex];
        status.textContent=`${feature.name}(${vertex}) = ${X[vertexIndex][featureIndex]}. ${feature.description}.`;
      }
    }
    X.forEach((values,i)=>{
      const row=body.insertRow(),label=vertexLabels[i],th=el('th',{scope:'row'});
      th.append(el('span',{class:'adjacency-widget__vertex-label'},label));
      row.append(th);rowHeaders.push(th);
      cells.push(values.map((value,j)=>{
        const cell=row.insertCell();
        cell.classList.toggle('is-nonzero',value!==0);
        const button=el('button',{type:'button',class:'feature-matrix__entry',
          'aria-label':`${features[j].name}(${label}) = ${aggregation?exactLabel(value):value}`});
        button.append(aggregation?mathNode('math',[mathNumber(value)],{displaystyle:'true'}):String(value));
        button.addEventListener('click',()=>select(i,j));
        cell.append(button);return cell;
      }));
    });
    root.replaceChildren(table,status);
  }
  function initialize(root){
    if(root.dataset.ready)return;root.dataset.ready='true';
    const get=name=>root.querySelector(`[data-roles-${name}]`),status=get('status');
    const adj=neighbors(graph),canvas=get('graph'),form=get('form');
    let selected=8,feature=0,current=null;
    const nodeElements=[];
    for(const [u,v]of graph.edges)canvas.append(svg('line',{x1:graph.nodes[u].x,y1:graph.nodes[u].y,
      x2:graph.nodes[v].x,y2:graph.nodes[v].y,class:'roles-widget__edge'}));
    for(const node of graph.nodes){
      const group=svg('g',{class:'roles-widget__node',tabindex:'0',role:'button',
        'data-role-node':node.id,transform:`translate(${node.x} ${node.y})`,'aria-label':`Wierzchołek ${node.label}`});
      group.append(svg('circle',{r:20,fill:'#8797a5'}),svg('text',{'text-anchor':'middle',dy:'.35em'},node.label),svg('title',{},`Wierzchołek ${node.label}`));
      const choose=()=>{selected=node.id;get('node').value=String(selected);renderSelection();};
      group.addEventListener('click',choose);
      group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose();}});
      canvas.append(group);nodeElements.push(group);
    }
    canvas.append(svg('text',{x:85,y:410,class:'roles-widget__component-label'},'Oddzielna składowa'));
    graph.nodes.forEach(n=>get('node').append(el('option',{value:n.id},`Wierzchołek ${n.label}`)));
    get('node').value=String(selected);
    function renderSelection(){
      if(!current)return;
      const {raw,scaled,weights,reconstructed,signed,components}=current;
      nodeElements.forEach((group,i)=>{
        group.classList.toggle('is-selected',i===selected);
        group.classList.toggle('is-neighbor',adj[selected].includes(i));
        group.setAttribute('aria-pressed',String(i===selected));
      });
      for(const matrix of [get('matrix-x'),get('matrix-w')]){
        for(const row of matrix.querySelectorAll('[data-matrix-row]')){
          row.classList.toggle('is-selected',Number(row.dataset.matrixRow)===selected);
        }
      }
      const row=weights[selected],maximum=Math.max(...row),bars=get('memberships');bars.replaceChildren();
      row.forEach((weight,k)=>{
        const entry=el('div',{class:'roles-widget__bar-row'});
        entry.append(el('span',{},components[k]));
        const track=el('span',{class:'roles-widget__bar-track','aria-hidden':'true'});
        const width=signed?50*Math.abs(weight):maximum?100*weight/maximum:0;
        const bar=el('span',{style:`width:${width}%;background:${palette[k]}`});
        if(signed){
          track.classList.add('roles-widget__bar-track--signed');
          bar.style.left=`${weight<0?50-width:50}%`;
        }
        track.append(bar);entry.append(track,el('span',{},fmt(signed&&Math.abs(weight)<.0005?0:weight)));bars.append(entry);
      });
      get('selection-title').textContent=`Opis wierzchołka ${graph.nodes[selected].label}`;
      if(signed){
        get('selection-note').textContent='Słupki SVD mają wspólną skalę od −1 do 1. Środek oznacza zero.';
      }else{
        get('selection-note').textContent=maximum>1e-9?
          'Słupki pokazują współczynniki W dla wybranego wierzchołka.':
          'Współczynniki są zerowe. Brak dominującej roli.';
      }
      const detail=raw.columns.map((c,j)=>[raw.X[selected][j],reconstructed[selected][j]*scaled.scales[j]]);
      get('reconstruction').replaceChildren(matrixTable(detail,['Cecha','Odtworzenie'],raw.columns.map(c=>c.name),'Cechy i ich odtworzenie w oryginalnej skali'));
      feature=Math.min(feature,raw.columns.length-1);get('feature').value=String(feature);
      const column=raw.columns[feature],label=graph.nodes[selected].label;
      if(column.depth===0){
        const meaning={degree:'Liczba sąsiadów',ego:'Liczba krawędzi o obu końcach w ego-necie',
          boundary:'Liczba krawędzi z dokładnie jednym końcem w ego-necie',
          triangles:'Liczba trójkątów zawierających wierzchołek',
          clustering:'2 × liczba trójkątów / (stopień × (stopień − 1)); dla stopnia < 2 przyjmujemy 0'};
        get('calculation').textContent=`${meaning[column.key]}: ${column.name}(${label}) = ${fmt(raw.X[selected][feature])}.`;
      }else{
        const values=adj[selected].map(v=>raw.X[v][column.parent]);
        const expression=values.length?`(${values.map(fmt).join(' + ')})${column.operation==='mean'?` / ${values.length}`:''}`:'0';
        get('calculation').textContent=`${column.name}(${label}) = ${expression} = ${fmt(raw.X[selected][feature])}. Wartości ${raw.columns[column.parent].name} bierzemy u sąsiadów: ${adj[selected].map(v=>graph.nodes[v].label).join(', ')||'brak'}.`;
      }
    }
    function calculate(){
      const keys=[...form.querySelectorAll('input[name="role-feature"]:checked')].map(e=>e.value);
      if(!keys.length){status.textContent='Wybierz przynajmniej jedną cechę. Widoki poniżej zachowują poprzedni wynik.';return;}
      const depth=Number(get('depth').value),aggregation=get('aggregation').value;
      const scale=get('scale').checked,signed=get('method').value==='svd';
      const raw=featureMatrix(graph,keys,depth,aggregation),scaled=scaleColumns(raw.X,scale);
      const maximumRank=Math.min(5,raw.columns.length);
      for(const option of get('rank').options)option.disabled=Number(option.value)>maximumRank;
      const rank=Math.min(Number(get('rank').value),maximumRank);get('rank').value=String(rank);
      get('rank-label').textContent=signed?'Liczba składników':'Liczba ról';
      status.textContent='Obliczanie rozkładu…';
      const result=signed?truncatedSvd(scaled.X,rank):nmf(scaled.X,rank);
      const reconstructed=multiply(result.W,result.H);
      const weights=signed?normalizeSignedWeights(result.W):result.W;
      const components=Array.from({length:rank},(_,i)=>`${signed?'S':'R'}${i+1}`);
      current={raw,scaled,weights,reconstructed,signed,components};
      get('feature').replaceChildren();raw.columns.forEach((c,i)=>get('feature').append(el('option',{value:i},c.name)));
      const vertices=graph.nodes.map(n=>n.label),names=raw.columns.map(c=>c.name);
      const profileLabel=signed?'Składniki SVD — macierz H':'Wektory ról — macierz H';
      get('profile-label').textContent=profileLabel;
      get('matrix-x').replaceChildren(matrixTable(scaled.X,names,vertices,'Macierz cech X używana w rozkładzie'));
      get('matrix-h').replaceChildren(matrixTable(result.H,names,components,profileLabel));
      get('matrix-w').replaceChildren(matrixTable(result.W,components,vertices,'Macierz współczynników W'));
      get('dimensions').textContent=`X: ${vertices.length} × ${names.length} · W: ${vertices.length} × ${rank} · H: ${rank} × ${names.length}`;
      get('error').textContent=`Błąd względny: ${(100*result.relativeError).toLocaleString('pl-PL',{maximumFractionDigits:2})}%`;
      get('scaling-note').hidden=!scale;
      get('legend').replaceChildren(...components.map((name,k)=>{
        const label=el('span');label.append(el('i',{style:`background:${palette[k]}`}),document.createTextNode(name));return label;
      }));
      nodeElements.forEach((group,i)=>{
        const component=dominantRole(weights[i],signed);
        group.querySelector('circle').setAttribute('fill',component===null?'#a5afb6':palette[component]);
        const description=component===null?'zerowe współczynniki':
          `${signed?'dominujący składnik':'dominująca rola'} ${components[component]}`;
        const label=`Wierzchołek ${graph.nodes[i].label}, ${description}`;
        group.querySelector('title').textContent=label;
        group.setAttribute('aria-label',label);
      });
      const colorNote=signed?'Kolor wskazuje składnik o największym |w|.':'Kolor wskazuje rolę o największym współczynniku W.';
      status.textContent=`Cechy początkowe: ${keys.length}. Rundy agregacji: ${depth}. Kolumny X: ${names.length}. ${colorNote} ${maximumRank<5?`Liczba ${signed?'składników':'ról'} ograniczona do ${maximumRank} przez liczbę cech.`:''}`;
      renderSelection();
    }
    form.addEventListener('change',calculate);
    get('node').addEventListener('change',()=>{selected=Number(get('node').value);renderSelection();});
    get('feature').addEventListener('change',()=>{feature=Number(get('feature').value);renderSelection();});
    function expand(value){
      root.classList.toggle('is-expanded',value);
      get('expand').setAttribute('aria-expanded',String(value));
      get('expand').textContent=value?'× Zwiń':'⛶ Powiększ';
    }
    get('expand').addEventListener('click',()=>expand(!root.classList.contains('is-expanded')));
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&root.classList.contains('is-expanded'))expand(false);});
    calculate();
  }
  const start=()=>{
    document.querySelectorAll('[data-feature-matrix]').forEach(initializeFeatureMatrix);
    document.querySelectorAll('[data-roles-widget]').forEach(initialize);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
