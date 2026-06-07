import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import * as pdfjsLib from "pdfjs-dist";
import {
  BookOpen, BarChart3, Sparkles, User, Shield, Search, Plus, Pencil, Trash2,
  Eye, Download, Star, MessageSquare, LogOut, Home, Library, Brain, Menu, X, UploadCloud
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, LineChart, Line, CartesianGrid
} from "recharts";
import "./styles.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL || "", SUPABASE_ANON_KEY || "");

const LOCAL_ADMIN_EMAIL = "admin@kutubxona.uz";
const LOCAL_ADMIN_PASSWORD = "123456";

const fmtDate = (v) => v ? new Date(v).toLocaleString("uz-UZ") : "";
const normalize = (v) => String(v || "").trim().toLowerCase();
const publicUrl = (bucket, path) => supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;

async function extractPdfText(file) {
  if (!file) return "";
  try {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer, useWorkerFetch: false, isEvalSupported: false }).promise;
    let fullText = "";
    const maxPages = Math.min(pdf.numPages, 25);
    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      fullText += content.items.map(item => item.str).join(" ") + "\n";
    }
    return fullText.slice(0, 40000);
  } catch (e) {
    console.warn("PDF matni o‘qilmadi:", e);
    return "";
  }
}

function App() {
  const [session, setSession] = useState(null);
  const [appUser, setAppUser] = useState(() => JSON.parse(localStorage.getItem("bmi_app_user") || "null"));
  const [localAdmin, setLocalAdmin] = useState(() => localStorage.getItem("bmi_local_admin") === "true");
  const [profile, setProfile] = useState(null);
  const [books, setBooks] = useState([]);
  const [comments, setComments] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [history, setHistory] = useState([]);
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [quizResults, setQuizResults] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [page, setPage] = useState("home");
  const [selectedBook, setSelectedBook] = useState(null);
  const [sidebar, setSidebar] = useState(false);
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem("bmi_theme_mode") || "system");
  const [loading, setLoading] = useState(true);

  const user = localAdmin ? { id: "local-admin", email: LOCAL_ADMIN_EMAIL } : (appUser || session?.user || null);
  const isAdmin = localAdmin || profile?.role === "admin";

  useEffect(() => {
    document.body.className = "";
    document.body.classList.add(`theme-${themeMode}`);
    localStorage.setItem("bmi_theme_mode", themeMode);
  }, [themeMode]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setBooks([]);
      setFavorites([]);
      setHistory([]);
      setQuizQuestions([]);
      setQuizResults([]);
      setProfiles([]);
      return;
    }
    if (localAdmin) {
      setProfile({ id: "local-admin", full_name: "Admin", group_name: "", role: "admin" });
    }
    loadAll();
    const channel = supabase
      .channel("library-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "books" }, loadBooks)
      .on("postgres_changes", { event: "*", schema: "public", table: "favorites" }, loadFavorites)
      .on("postgres_changes", { event: "*", schema: "public", table: "reading_history" }, loadHistory)
      .on("postgres_changes", { event: "*", schema: "public", table: "quiz_results" }, loadQuizResults)
      .on("postgres_changes", { event: "*", schema: "public", table: "quiz_questions" }, loadQuizQuestions)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, loadComments)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, loadProfiles)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user?.id, profile?.role, localAdmin, appUser?.id]);

  async function loadAll() {
    setLoading(true);
    await loadProfile();
    await Promise.all([loadBooks(), loadComments(), loadFavorites(), loadHistory(), loadQuizQuestions(), loadQuizResults()]);
    setLoading(false);
  }

  async function loadProfile() {
    if (!user) return;
    if (localAdmin) {
      setProfile({ id: "local-admin", full_name: "Admin", group_name: "", role: "admin" });
      return;
    }
    if (appUser) {
      setProfile({ id: appUser.id, full_name: appUser.full_name, group_name: appUser.group_name, role: appUser.role || "user" });
      return;
    }
    const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    if (!error) setProfile(data);
  }

  async function loadBooks() {
    const { data, error } = await supabase.from("books").select("*").order("created_at", { ascending: true });
    if (!error) setBooks(data || []);
  }
  async function loadComments() {
    const { data, error } = await supabase.from("comments").select("*").order("created_at", { ascending: false });
    if (!error) setComments(data || []);
  }
  async function loadFavorites() {
    const { data, error } = await supabase.from("favorites").select("*").order("created_at", { ascending: false });
    if (!error) setFavorites(data || []);
  }
  async function loadHistory() {
    const { data, error } = await supabase.from("reading_history").select("*").order("created_at", { ascending: false });
    if (!error) setHistory(data || []);
  }
  async function loadQuizQuestions() {
    const { data, error } = await supabase.from("quiz_questions").select("*").order("created_at", { ascending: true });
    if (!error) setQuizQuestions(data || []);
  }
  async function loadQuizResults() {
    const { data, error } = await supabase.from("quiz_results").select("*").order("created_at", { ascending: false });
    if (!error) setQuizResults(data || []);
  }
  async function loadProfiles() {
    if (!isAdmin && !localAdmin) return;
    const { data, error } = await supabase.from("app_users").select("*").order("created_at", { ascending: false });
    if (!error) setProfiles(data || []);
  }
  useEffect(() => { if (isAdmin || localAdmin) loadProfiles(); }, [isAdmin, localAdmin]);

  const requireAuth = (target) => {
    if (!user) {
      alert("Elektron kutubxonadan to‘liq foydalanish uchun ro‘yxatdan o‘ting yoki tizimga kiring.");
      setPage("login");
      return false;
    }
    setPage(target);
    return true;
  };

  const toggleFavorite = async (book) => {
    if (!user) return requireAuth("login");
    const existing = favorites.find(f => f.book_id === book.id && f.user_id === user.id);
    const response = existing
      ? await supabase.from("favorites").delete().eq("id", existing.id)
      : await supabase.from("favorites").insert({ book_id: book.id, user_id: user.id });
    if (response.error) {
      alert(response.error.message);
      return;
    }
    await loadFavorites();
  };

  const isFavorite = (bookId) => favorites.some(f => f.book_id === bookId && f.user_id === user?.id);

  const openBook = async (book) => {
    if (!user) return requireAuth("login");
    const viewRes = await supabase.rpc("increment_book_view", { book_uuid: book.id });
    if (viewRes.error) {
      alert(viewRes.error.message);
      return;
    }
    await supabase.from("reading_history").insert({ book_id: book.id, user_id: user.id, status: "reading" });
    setSelectedBook(book);
    setPage("detail");
    await Promise.all([loadBooks(), loadHistory()]);
  };

  const downloadBook = async (book) => {
    if (!user) return requireAuth("login");
    if (!book.pdf_url) {
      alert("PDF fayl mavjud emas.");
      return;
    }
    const dlRes = await supabase.rpc("increment_book_download", { book_uuid: book.id });
    if (dlRes.error) {
      alert(dlRes.error.message);
      return;
    }
    await supabase.from("reading_history").insert({ book_id: book.id, user_id: user.id, status: "downloaded" });
    window.open(book.pdf_url, "_blank");
    await Promise.all([loadBooks(), loadHistory()]);
  };

  const logout = async () => {
    localStorage.removeItem("bmi_local_admin");
    localStorage.removeItem("bmi_app_user");
    setLocalAdmin(false);
    setAppUser(null);
    await supabase.auth.signOut();
    setPage("home");
  };

  const categories = useMemo(() => ["Barchasi", ...new Set(books.map(b => b.category))], [books]);
  const myHistory = history.filter(h => h.user_id === user?.id);
  const recommendations = useMemo(() => {
    const lastBookId = myHistory[0]?.book_id;
    const lastBook = books.find(b => b.id === lastBookId);
    let list = books.filter(b => !myHistory.some(h => h.book_id === b.id));
    if (lastBook) list = [...books.filter(b => b.category === lastBook.category), ...list];
    return [...new Map(list.map(b => [b.id, b])).values()]
      .sort((a,b) => ((b.rating || 0) + (b.views || 0) / 100) - ((a.rating || 0) + (a.views || 0) / 100))
      .slice(0,4);
  }, [books, myHistory]);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return <main className="container"><div className="empty"><h2>Supabase sozlanmagan</h2><p>.env faylga VITE_SUPABASE_URL va VITE_SUPABASE_ANON_KEY kiriting.</p></div></main>;
  }

  return (
    <div className="app">
      <Header user={user} profile={profile} setPage={setPage} requireAuth={requireAuth} logout={logout} sidebar={sidebar} setSidebar={setSidebar} />
      <MobileMenu show={sidebar} setPage={setPage} requireAuth={requireAuth} setSidebar={setSidebar} isAdmin={isAdmin} />
      <main className="container">
        {loading && <div className="infoBox">Yuklanmoqda...</div>}
        {page === "home" && <HomePage books={books} requireAuth={requireAuth} openBook={openBook} />}
        {page === "books" && (user ? <BooksPage books={books} categories={categories} openBook={openBook} /> : <AccessRequired setPage={setPage} />)}
        {page === "detail" && selectedBook && <BookDetail book={books.find(b=>b.id===selectedBook.id) || selectedBook} downloadBook={downloadBook} comments={comments} loadComments={loadComments} profile={profile} user={user} quizQuestions={quizQuestions} quizResults={quizResults} loadQuizResults={loadQuizResults} toggleFavorite={toggleFavorite} isFavorite={isFavorite} />}
        {page === "recommend" && (user ? <RecommendPage recommendations={recommendations} openBook={openBook} /> : <AccessRequired setPage={setPage} />)}
        {page === "ai" && (user ? <AiAssistant books={books} openBook={openBook} /> : <AccessRequired setPage={setPage} />)}
        {page === "login" && <LoginPage setPage={setPage} setSession={setSession} setLocalAdmin={setLocalAdmin} setAppUser={setAppUser} />}
        {page === "profile" && <ProfilePage user={user} profile={profile} books={books} favorites={favorites} history={history} quizResults={quizResults} themeMode={themeMode} setThemeMode={setThemeMode} loadProfile={loadProfile} />}
        {page === "admin" && (isAdmin ? <AdminPanel books={books} loadBooks={loadBooks} profiles={profiles} favorites={favorites} history={history} quizResults={quizResults} quizQuestions={quizQuestions} loadQuizQuestions={loadQuizQuestions} /> : <AccessRequired setPage={setPage} />)}
      </main>
    </div>
  );
}

function Header({ user, profile, setPage, requireAuth, logout, sidebar, setSidebar }) {
  const nav = [["home","Bosh sahifa"],["books","Kitoblar"],["recommend","Tavsiyalar"],["ai","AI yordamchi"]];
  return (
    <header className="header">
      <div className="brand" onClick={()=>setPage("home")}><BookOpen/><span>Elektron Kutubxona</span></div>
      <nav className="nav">
        {nav.map(([p,t])=><button key={p} onClick={()=>p==="home"?setPage(p):requireAuth(p)}>{t}</button>)}
        {profile?.role==="admin" && <button className="adminBtn" onClick={()=>setPage("admin")}><Shield size={16}/> Admin</button>}
      </nav>
      <div className="headerActions">
        {user ? <>
          <button className="ghost" onClick={()=>setPage("profile")}><User size={17}/> {profile?.full_name || user.email}</button>
          <button className="ghost" onClick={logout}><LogOut size={17}/></button>
        </> : <button className="loginBtn" onClick={()=>setPage("login")}>Kirish</button>}
        <button className="menuBtn" onClick={()=>setSidebar(!sidebar)}>{sidebar?<X/>:<Menu/>}</button>
      </div>
    </header>
  );
}

function MobileMenu({ show, setPage, requireAuth, setSidebar, isAdmin }) {
  if (!show) return null;
  const items = [["home","Bosh sahifa",Home],["books","Kitoblar",Library],["recommend","Tavsiyalar",Sparkles],["ai","AI yordamchi",Brain],...(isAdmin?[["admin","Admin panel",Shield]]:[])];
  return <div className="mobileMenu">{items.map(([p,t,Icon])=><button key={p} onClick={()=>{p==="home"?setPage(p):requireAuth(p);setSidebar(false)}}><Icon size={18}/>{t}</button>)}</div>;
}

function HomePage({ books, requireAuth, openBook }) {
  const popular = [...books].sort((a,b)=>(b.views||0)-(a.views||0)).slice(0,3);
  return <>
    <section className="hero">
      <div>
        <p className="badge">Elektron kutubxona resurslaridan qulay va samarali foydalaning</p>
        <h1>Elektron resurslardan foydalanish statistikasi va kitob tavsiyalari</h1>
        <p className="heroText">Platforma Supabase orqali real foydalanuvchilar, kitoblar, PDF fayllar, statistika, sevimlilar va quiz natijalarini saqlaydi.</p>
        <div className="heroActions"><button onClick={()=>requireAuth("books")}>Kitoblarni ko‘rish</button><button className="secondary" onClick={()=>requireAuth("recommend")}>Tavsiyalar</button></div>
      </div>
      <div className="heroCard"><BarChart3 size={46}/><h3>Real vaqt statistikasi</h3><p>Ko‘rishlar, yuklab olishlar, quiz va sevimlilar Supabase’da saqlanadi.</p></div>
    </section>
    <section className="statsGrid">
      <Stat title="Jami kitoblar" value={books.length}/>
      <Stat title="Jami ko‘rishlar" value={books.reduce((s,b)=>s+(b.views||0),0)}/>
      <Stat title="Yuklab olishlar" value={books.reduce((s,b)=>s+(b.downloads||0),0)}/>
      <Stat title="O‘rtacha reyting" value={books.length ? (books.reduce((s,b)=>s+Number(b.rating||0),0)/books.length).toFixed(1) : 0}/>
    </section>
    <SectionTitle title="Eng ko‘p o‘qilgan kitoblar"/>
    {popular.length ? <div className="bookGrid">{popular.map(b=><BookCard key={b.id} book={b} openBook={openBook}/>)}</div> : <Empty text="Hozircha kitob mavjud emas."/>}
  </>;
}

function BooksPage({ books, categories, openBook }) {
  const [q,setQ]=useState("");
  const [cat,setCat]=useState("Barchasi");
  const filtered=books.filter(b=>(cat==="Barchasi"||b.category===cat)&&(`${b.title} ${b.author} ${b.category}`.toLowerCase().includes(q.toLowerCase())));
  return <>
    <SectionTitle title="Elektron kitoblar katalogi"/>
    <div className="toolbar"><div className="search"><Search size={18}/><input placeholder="Kitob, muallif yoki kategoriya qidiring..." value={q} onChange={e=>setQ(e.target.value)}/></div><select value={cat} onChange={e=>setCat(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></div>
    {filtered.length ? <div className="bookGrid">{filtered.map(b=><BookCard key={b.id} book={b} openBook={openBook}/>)}</div> : <Empty text="Mos kitob topilmadi."/>}
  </>;
}

function BookCard({ book, openBook }) {
  return <article className="bookCard">
    {book.cover_url ? <img src={book.cover_url} alt={book.title}/> : <div className="noCover"><BookOpen size={44}/><span>Kitob rasmi</span></div>}
    <div className="bookBody">
      <span className="tag">{book.category}</span>
      <h3>{book.title}</h3>
      <p className="muted">{book.author}</p>
      <p>{book.description}</p>
      <div className="bookMeta"><span><Eye size={15}/> {book.views||0}</span><span><Star size={15}/> {book.rating||0}</span></div>
      <button onClick={()=>openBook(book)}>Batafsil ko‘rish</button>
    </div>
  </article>;
}

function BookDetail({ book, downloadBook, comments, loadComments, profile, user, quizQuestions, quizResults, loadQuizResults, toggleFavorite, isFavorite }) {
  const [text,setText]=useState("");
  const [rate,setRate]=useState(5);
  const bookComments=comments.filter(c=>c.book_id===book.id);
  const questions=quizQuestions.filter(q=>q.book_id===book.id);

  async function addComment() {
    if (!text.trim()) return alert("Sharh yozing.");
    const { error } = await supabase.from("comments").insert({ book_id: book.id, user_id: user.id, user_name: profile?.full_name || user.email, text, rate });
    if (error) return alert(error.message);
    await supabase.rpc("refresh_book_rating", { book_uuid: book.id });
    setText("");
    await loadComments();
  }

  return <section className="detail">
    {book.cover_url ? <img className="detailCover" src={book.cover_url}/> : <div className="detailCover noCover"><BookOpen size={70}/><span>Kitob rasmi yuklanmagan</span></div>}
    <div className="detailInfo">
      <span className="tag">{book.category}</span><h1>{book.title}</h1><p className="muted">Muallif: {book.author}</p><p>{book.description}</p>
      <div className="detailStats"><span><Eye/> {book.views||0} ko‘rish</span><span><Download/> {book.downloads||0} yuklab olish</span><span><Star/> {book.rating||0} reyting</span></div>
      <div className="heroActions">
        <button onClick={()=>book.pdf_url ? window.open(book.pdf_url,"_blank") : alert("PDF fayl mavjud emas.")}>PDF ko‘rish</button>
        <button className="secondary" onClick={()=>downloadBook(book)}>Yuklab olish</button>
        <button className={isFavorite(book.id) ? "favDetail active" : "favDetail"} onClick={()=>toggleFavorite(book)}><Star size={18} fill={isFavorite(book.id) ? "currentColor" : "none"}/> {isFavorite(book.id) ? "Sevimlidan olib tashlash" : "Sevimliga qo‘shish"}</button>
      </div>
      <QuizRunner book={book} questions={questions} user={user} profile={profile} quizResults={quizResults} loadQuizResults={loadQuizResults}/>
      <div className="commentBox">
        <h3><MessageSquare size={18}/> Sharh qoldirish</h3>
        <div className="formRow"><input value={profile?.full_name || user.email} disabled/><select value={rate} onChange={e=>setRate(Number(e.target.value))}>{[5,4,3,2,1].map(n=><option key={n} value={n}>{n} baho</option>)}</select></div>
        <textarea placeholder="Kitob haqida fikringiz..." value={text} onChange={e=>setText(e.target.value)}/>
        <button onClick={addComment}>Sharh yuborish</button>
      </div>
      <div className="comments">{bookComments.map(c=><div className="comment" key={c.id}><b>{c.user_name}</b> <span>{c.rate}★ · {fmtDate(c.created_at)}</span><p>{c.text}</p></div>)}</div>
    </div>
  </section>;
}

function QuizRunner({ book, questions, user, profile, quizResults, loadQuizResults }) {
  const [answers,setAnswers]=useState({});
  const [result,setResult]=useState(null);
  const myResults=quizResults.filter(r=>r.book_id===book.id && r.user_id===user.id);
  const choose=(qid,idx)=>{ if(!result) setAnswers({...answers,[qid]:idx}); };
  async function finish() {
    if (!questions.length) return;
    if (Object.keys(answers).length !== questions.length) return alert("Barcha test savollariga javob bering.");
    let correct=0;
    const details=questions.map(q=>{
      const selected=answers[q.id];
      const ok=Number(selected)===Number(q.correct_index);
      if(ok) correct++;
      return { question:q.question, selected, correctIndex:q.correct_index, selectedText:q.options[selected], correctText:q.options[q.correct_index], isCorrect:ok };
    });
    const percent=Math.round((correct/questions.length)*100);
    const payload={ book_id:book.id, user_id:user.id, user_name:profile?.full_name||user.email, book_title:book.title, total:questions.length, correct, percent, details };
    const { data, error } = await supabase.from("quiz_results").insert(payload).select().single();
    if(error) return alert(error.message);
    setResult(data);
    await loadQuizResults();
  }
  return <div className="quizBox">
    <h3>Kitob bo‘yicha quiz testlar</h3>
    {!questions.length && <p className="muted">Bu kitob uchun hali quiz testlar admin tomonidan tuzilmagan.</p>}
    {!!questions.length && <>
      <div className="quizInfo"><span>Jami savollar: <b>{questions.length}</b></span>{result && <span>Ball: <b>{result.percent}%</b> <small>({result.correct}/{result.total} to‘g‘ri)</small></span>}</div>
      {questions.map((q,i)=><div className="quizQuestion" key={q.id}><h4>{i+1}. {q.question}</h4><div className="quizOptions">{q.options.map((opt,idx)=>{
        const selected=answers[q.id]===idx, show=!!result, correct=Number(q.correct_index)===idx, wrong=show&&selected&&!correct, right=show&&correct;
        return <button key={idx} className={`${selected?"selected":""} ${right?"correct":""} ${wrong?"wrong":""}`} onClick={()=>choose(q.id,idx)}>{String.fromCharCode(65+idx)}. {opt}</button>;
      })}</div></div>)}
      <div className="heroActions">{!result ? <button onClick={finish}>Testni yakunlash</button> : <button onClick={()=>{setAnswers({});setResult(null)}}>Qayta ishlash</button>}</div>
    </>}
    <h3>Quiz natijalari tarixi</h3>
    <div className="historyList">{myResults.length ? myResults.slice(0,5).map(r=><div key={r.id}><b>{r.correct}/{r.total} to‘g‘ri — {r.percent}%</b><span>{fmtDate(r.created_at)}</span></div>) : <p className="muted">Hali quiz ishlanmagan.</p>}</div>
  </div>;
}

function RecommendPage({ recommendations, openBook }) {
  return <><SectionTitle title="Shaxsiy kitob tavsiyalari"/><div className="infoBox">Tavsiyalar oxirgi o‘qilgan kitoblar, kategoriya, reyting va ko‘rishlar asosida shakllanadi.</div>{recommendations.length ? <div className="bookGrid">{recommendations.map(b=><BookCard key={b.id} book={b} openBook={openBook}/>)}</div> : <Empty text="Tavsiya uchun avval bir nechta kitobni ko‘ring."/>}</>;
}

function AiAssistant({ books, openBook }) {
  const [q,setQ]=useState("");
  const [answers,setAnswers]=useState([]);
  const ask=()=>{
    if(!q.trim()) return alert("Savol yozing.");
    const words=normalize(q).split(/\s+/).filter(w=>w.length>2);
    const scored=books.map(book=>{
      const hay=normalize(`${book.title} ${book.author} ${book.category} ${book.description} ${book.pdf_text||""}`);
      const score=words.reduce((s,w)=>s+(hay.includes(w)?1:0),0);
      return {book,score};
    }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
    const selected=(scored.length?scored.map(x=>x.book):books).slice(0,3);
    const best=selected[0];
    const source=best?.pdf_text || best?.description || "";
    const relevant=source.split(/(?<=[.!?])\s+|\n+/).map(x=>x.trim()).filter(Boolean).map(sentence=>({sentence,score:words.reduce((s,w)=>s+(normalize(sentence).includes(w)?1:0),0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,4).map(x=>x.sentence);
    const text=relevant.length?`Yuklangan PDF kitoblar ichidan topilgan javob: ${relevant.join(" ")}`:`Eng yaqin manba: "${best?.title || "kitob topilmadi"}".`;
    setAnswers([{q,text,result:selected},...answers]); setQ("");
  };
  return <><SectionTitle title="AI kitob tavsiya yordamchisi"/><div className="aiBox"><p>AI yordamchi admin yuklagan PDF matnlari ichidan savolga mos javob qidiradi.</p><div className="search"><Sparkles size={18}/><input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&ask()} placeholder="Savolingizni yozing..."/></div><button onClick={ask}>Javob berish</button></div>{answers.map((a,i)=><div className="answer" key={i}><h3>Savol: {a.q}</h3><p>{a.text}</p>{a.result?.length?<div className="bookGrid">{a.result.map(b=><BookCard key={b.id} book={b} openBook={openBook}/>)}</div>:null}</div>)}</>;
}

function LoginPage({ setPage, setLocalAdmin, setAppUser }) {
  const [mode,setMode]=useState("login");
  const [fullName,setFullName]=useState("");
  const [groupName,setGroupName]=useState("");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  async function register() {
    if(!fullName.trim()||!groupName.trim()||!email.trim()||!password.trim()) return alert("Ma'lumotlarni to‘liq kiriting.");
    const { data, error } = await supabase.auth.signUp({ email, password, options:{ data:{ full_name:fullName, group_name:groupName } } });
    if(error) return alert(error.message);
    if(data.session) setPage("books"); else alert("Ro‘yxatdan o‘tildi. Email tasdiqlash yoqilgan bo‘lsa, emailingizni tasdiqlang va keyin kiring.");
  }
  async function login() {
    if(!email.trim()||!password.trim()) return alert("Ma'lumotlarni to‘liq kiriting.");

    if (email.trim().toLowerCase() === LOCAL_ADMIN_EMAIL && password.trim() === LOCAL_ADMIN_PASSWORD) {
      localStorage.setItem("bmi_local_admin", "true");
      setLocalAdmin(true);
      setPage("admin");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if(error) return alert("Bunday foydalanuvchi ro‘yxatdan o‘tmagan yoki parol noto‘g‘ri.");
    setPage("books");
  }
  return <div className="loginPage"><div className="loginCard"><Shield size={42}/><h2>{mode==="login"?"Tizimga kirish":"Ro‘yxatdan o‘tish"}</h2><div className="authSwitch"><button className={mode==="login"?"active":""} onClick={()=>setMode("login")}>Kirish</button><button className={mode==="register"?"active":""} onClick={()=>setMode("register")}>Ro‘yxatdan o‘tish</button></div>{mode==="register"&&<><input placeholder="F.I.Sh" value={fullName} onChange={e=>setFullName(e.target.value)}/><input placeholder="Guruh nomi" value={groupName} onChange={e=>setGroupName(e.target.value)}/></>}<input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}/><input type="password" placeholder="Parol" value={password} onChange={e=>setPassword(e.target.value)}/>{mode==="login"?<button onClick={login}>Kirish</button>:<button onClick={register}>Ro‘yxatdan o‘tish</button>}</div></div>;
}

function ProfilePage({ user, profile, books, favorites, history, quizResults, themeMode, setThemeMode, loadProfile }) {
  const [oldPass,setOldPass]=useState("");
  const [newPass,setNewPass]=useState("");
  const myFav=favorites.filter(f=>f.user_id===user.id);
  const myHist=history.filter(h=>h.user_id===user.id);
  const myQuiz=quizResults.filter(r=>r.user_id===user.id);
  async function changePassword() {
    if (user.email === LOCAL_ADMIN_EMAIL && profile?.role === "admin") {
      alert("Demo admin paroli kod ichida belgilangan: 123456. Uni o‘zgartirish uchun dastur kodidagi LOCAL_ADMIN_PASSWORD qiymatini o‘zgartirish kerak.");
      return;
    }
    if(!newPass.trim()) return alert("Yangi parolni kiriting.");
    if(user.id && user.id !== "local-admin") {
      const { error } = await supabase.from("app_users").update({ password: newPass.trim() }).eq("id", user.id);
      if(error) return alert(error.message);
      setOldPass(""); setNewPass(""); alert("Parol almashtirildi.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password:newPass });
    if(error) return alert(error.message);
    setOldPass(""); setNewPass(""); alert("Parol almashtirildi.");
  }
  return <><SectionTitle title={profile?.role==="admin"?"Admin profili":"Foydalanuvchi kabineti"}/><div className="profileLayout"><div className="profileCard">{profile?.role==="admin"?<Shield size={50}/>:<User size={50}/>}<h2>{profile?.full_name}</h2><p>{user.email}</p><span className="tag">{profile?.role==="admin"?"Administrator":"Foydalanuvchi"}</span></div><div className="profileInfo"><h3>Ro‘yxatdan o‘tgan ma'lumotlar</h3><div className="infoRows"><p><b>F.I.Sh:</b> {profile?.full_name}</p><p><b>Email:</b> {user.email}</p><p><b>Guruh:</b> {profile?.group_name}</p></div><h3>Sayt rejimi</h3><div className="modeGrid">{[["light","Kunduzgi"],["evening","Kechqurun"],["system","Qurilma sozlamasi"],["nightlight","Tungi yorug‘lik"]].map(([v,t])=><button key={v} className={themeMode===v?"active":""} onClick={()=>setThemeMode(v)}>{t}</button>)}</div><h3>Parolni almashtirish</h3><div className="passwordBox"><input type="password" placeholder="Yangi parol" value={newPass} onChange={e=>setNewPass(e.target.value)}/><button onClick={changePassword}>Parolni almashtirish</button></div></div></div><SectionTitle title="Sevimlilar"/><div className="favoriteList">{myFav.length?myFav.map(f=>{const b=books.find(x=>x.id===f.book_id);return <div className="favoriteItem" key={f.id}>{b?.cover_url?<img src={b.cover_url}/>:<div className="miniCover"><BookOpen size={22}/></div>}<div><b>{b?.title||"Kitob"}</b><span>{b?.category} · Qo‘shilgan: {fmtDate(f.created_at)}</span></div></div>}):<Empty text="Hali sevimli kitob qo‘shilmagan."/>}</div><SectionTitle title="O‘qilgan va o‘qilayotgan kitoblar"/><div className="historyList">{myHist.length?myHist.map(h=>{const b=books.find(x=>x.id===h.book_id);return <div key={h.id}><b>{b?.title||"Kitob"}</b><span>{h.status==="downloaded"?"Yuklab olindi":"O‘qilmoqda"} · {fmtDate(h.created_at)}</span></div>}):<Empty text="Hali kitob o‘qilmagan."/>}</div><SectionTitle title="Quiz test natijalari"/><div className="historyList">{myQuiz.length?myQuiz.map(r=><div key={r.id}><b>{r.book_title}</b><span>{r.correct}/{r.total} to‘g‘ri · {r.percent}% · {fmtDate(r.created_at)}</span></div>):<Empty text="Hali quiz test ishlanmagan."/>}</div></>;
}

function AdminPanel({ books, loadBooks, profiles, favorites, history, quizResults, quizQuestions, loadQuizQuestions }) {
  const [tab,setTab]=useState("stats");
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState(emptyBook());
  const [quizDraft,setQuizDraft]=useState(emptyQuiz());
  const [loading,setLoading]=useState(false);
  const chartData = Object.values(history.reduce((acc,h)=>{const d=h.created_at?.slice(0,10); acc[d] ||= {date:d, views:0, downloads:0}; if(h.status==="reading") acc[d].views++; if(h.status==="downloaded") acc[d].downloads++; return acc;},{}));

  async function uploadFile(bucket, file, folder) {
    if(!file) return { url:"", path:"" };
    const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
    const path=`${folder}/${Date.now()}_${safe}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert:true });
    if(error) throw error;
    return { path, url: publicUrl(bucket,path) };
  }

  async function saveBook() {
    if(!form.title.trim()||!form.author.trim()||!form.category.trim()||!form.description.trim()) return alert("Ma'lumotlarni to‘liq kiriting.");
    try {
      setLoading(true);
      let payload={ title:form.title, author:form.author, category:form.category, description:form.description };
      if(form.coverFile){ const r=await uploadFile("book-covers",form.coverFile,"covers"); payload.cover_url=r.url; payload.cover_path=r.path; }
      if(form.pdfFile){ const r=await uploadFile("book-pdfs",form.pdfFile,"pdfs"); payload.pdf_url=r.url; payload.pdf_path=r.path; payload.pdf_text=await extractPdfText(form.pdfFile); }
      let bookId=editing;
      if(editing){
        const { error }=await supabase.from("books").update(payload).eq("id",editing); if(error) throw error;
      }else{
        const { data,error }=await supabase.from("books").insert(payload).select().single(); if(error) throw error; bookId=data.id;
      }
      for(const q of (form.quiz||[])){
        await supabase.from("quiz_questions").insert({ book_id:bookId, question:q.question, options:q.options, correct_index:q.correct_index });
      }
      setForm(emptyBook()); setQuizDraft(emptyQuiz()); setEditing(null); setTab("manage"); await Promise.all([loadBooks(),loadQuizQuestions()]);
    } catch(e){ alert(e.message); } finally { setLoading(false); }
  }

  async function editBook(book) {
    setEditing(book.id);
    setForm({ title:book.title, author:book.author, category:book.category, description:book.description, coverFile:null, pdfFile:null, quiz:[] });
    setTab("add");
  }
  async function deleteBook(id) {
    if(!confirm("Kitob o‘chirilsinmi?")) return;
    await supabase.from("books").delete().eq("id",id); await loadBooks();
  }
  async function addQuiz() {
    if(!quizDraft.question.trim()||quizDraft.options.some(o=>!o.trim())) return alert("Savol va 4 ta variantni to‘liq kiriting.");
    if(editing){
      const { error }=await supabase.from("quiz_questions").insert({ book_id:editing, question:quizDraft.question, options:quizDraft.options, correct_index:quizDraft.correct_index });
      if(error) return alert(error.message);
      await loadQuizQuestions();
    }else{
      setForm({...form, quiz:[...(form.quiz||[]), {...quizDraft, id:crypto.randomUUID()}]});
    }
    setQuizDraft(emptyQuiz());
  }
  async function deleteQuiz(id) { await supabase.from("quiz_questions").delete().eq("id",id); await loadQuizQuestions(); }

  return <><SectionTitle title="Admin boshqaruv paneli"/><div className="tabs">{[["stats","Statistika"],["manage","Kitoblarni boshqarish"],["users","Foydalanuvchilar"],["quizResults","Quiz natijalari"]].map(([v,t])=><button key={v} className={tab===v?"active":""} onClick={()=>setTab(v)}>{t}</button>)}<button className={tab==="add"?"active":""} onClick={()=>{setEditing(null);setForm(emptyBook());setTab("add")}}><Plus size={16}/> Kitob yuklash</button></div>
    {tab==="stats"&&<><div className="statsGrid"><Stat title="Jami kitoblar" value={books.length}/><Stat title="Jami ko‘rishlar" value={books.reduce((s,b)=>s+(b.views||0),0)}/><Stat title="Yuklab olishlar" value={books.reduce((s,b)=>s+(b.downloads||0),0)}/><Stat title="Sevimlilar" value={favorites.length}/><Stat title="Quiz natijalari" value={quizResults.length}/></div><div className="chartCard"><h3>Kunlik foydalanish</h3><ResponsiveContainer width="100%" height={280}><LineChart data={chartData.length?chartData:[{date:new Date().toISOString().slice(0,10),views:0,downloads:0}]}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="date"/><YAxis/><Tooltip/><Line type="monotone" dataKey="views"/><Line type="monotone" dataKey="downloads"/></LineChart></ResponsiveContainer></div><div className="chartCard"><h3>Eng ko‘p o‘qilgan kitoblar</h3><ResponsiveContainer width="100%" height={280}><BarChart data={books.slice().sort((a,b)=>(b.views||0)-(a.views||0)).slice(0,6)}><XAxis dataKey="title"/><YAxis/><Tooltip/><Bar dataKey="views"/></BarChart></ResponsiveContainer></div></>}
    {tab==="manage"&&<div className="adminList">{books.map(b=><div className="adminItem" key={b.id}>{b.cover_url?<img src={b.cover_url}/>:<div className="miniCover"><BookOpen size={22}/></div>}<div><b>{b.title}</b><span>{b.author} · {b.category} · {b.pdf_url?"PDF bor":"PDF yo‘q"}</span></div><button onClick={()=>editBook(b)}><Pencil size={16}/> Tahrirlash</button><button className="danger" onClick={()=>deleteBook(b.id)}><Trash2 size={16}/> O‘chirish</button></div>)}</div>}
    {tab==="users"&&<div className="adminTable"><h3>Ro‘yxatdan o‘tgan foydalanuvchilar</h3>{profiles.map((p,i)=>{const uh=history.filter(h=>h.user_id===p.id), uf=favorites.filter(f=>f.user_id===p.id), uq=quizResults.filter(r=>r.user_id===p.id); const rids=[...new Set(uh.map(h=>h.book_id))]; const favNames=uf.map(f=>books.find(b=>b.id===f.book_id)?.title).filter(Boolean); const readNames=rids.map(id=>books.find(b=>b.id===id)?.title).filter(Boolean); return <div className="adminUserCard" key={p.id}><div className="adminUserTop"><b>{i+1}. {p.full_name}</b><span>{p.group_name}</span><span>{p.role}</span></div><div className="adminUserStats"><span>O‘qigan/o‘qimoqda: <b>{rids.length}</b></span><span>Yuklab olgan: <b>{new Set(uh.filter(h=>h.status==="downloaded").map(h=>h.book_id)).size}</b></span><span>Sevimlilar: <b>{uf.length}</b></span><span>Quiz: <b>{uq.length}</b></span><span>Oxirgi ball: <b>{uq[0]?.percent ?? "Yo‘q"}{uq[0]?"%":""}</b></span></div><div className="adminUserDetails"><p><b>Sevimliga qo‘shgan kitoblari:</b> {favNames.length?favNames.join(", "):"Yo‘q"}</p><p><b>O‘qigan/o‘qiyotgan kitoblari:</b> {readNames.length?readNames.join(", "):"Yo‘q"}</p></div></div>})}</div>}
    {tab==="quizResults"&&<div className="adminTable"><h3>Barcha quiz natijalari</h3>{quizResults.map((r,i)=><div className="adminTableRow" key={r.id}><b>{i+1}. {r.user_name}</b><span>{r.book_title}</span><span>{r.correct}/{r.total} — {r.percent}%</span><span>{fmtDate(r.created_at)}</span></div>)}</div>}
    {tab==="add"&&<div className="bookForm"><input placeholder="Kitob nomi" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/><input placeholder="Muallif" value={form.author} onChange={e=>setForm({...form,author:e.target.value})}/><input placeholder="Kategoriya" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/><textarea placeholder="Kitob tavsifi" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/><label className="fileBox"><b>Kitob rasmi yuklash</b><span>{form.coverFile?.name||"Rasm tanlang"}</span><input type="file" accept="image/*" onChange={e=>setForm({...form,coverFile:e.target.files[0]})}/></label><label className="fileBox"><b>PDF kitob yuklash</b><span>{form.pdfFile?.name||"PDF tanlang"}</span><input type="file" accept="application/pdf,.pdf" onChange={e=>setForm({...form,pdfFile:e.target.files[0]})}/></label><div className="quizAdminBox"><h3>Quiz testlarni boshqarish</h3><input placeholder="Test savoli" value={quizDraft.question} onChange={e=>setQuizDraft({...quizDraft,question:e.target.value})}/>{quizDraft.options.map((o,i)=><input key={i} placeholder={`${String.fromCharCode(65+i)}-variant`} value={o} onChange={e=>{const next=[...quizDraft.options];next[i]=e.target.value;setQuizDraft({...quizDraft,options:next})}}/>)}<select value={quizDraft.correct_index} onChange={e=>setQuizDraft({...quizDraft,correct_index:Number(e.target.value)})}>{[0,1,2,3].map(i=><option key={i} value={i}>To‘g‘ri javob: {String.fromCharCode(65+i)}</option>)}</select><button type="button" onClick={addQuiz}>Quiz savol qo‘shish</button><div className="quizAdminList">{(editing?quizQuestions.filter(q=>q.book_id===editing):(form.quiz||[])).map((q,i)=><div className="quizAdminItem" key={q.id}><b>{i+1}. {q.question}</b><span>To‘g‘ri javob: {String.fromCharCode(65+Number(q.correct_index))}</span>{editing&&<button className="danger" onClick={()=>deleteQuiz(q.id)}>O‘chirish</button>}</div>)}</div></div><button onClick={saveBook} disabled={loading}>{loading?"Saqlanmoqda...":editing?"O‘zgarishlarni saqlash":"Kitob yuklash"}</button></div>}
  </>;
}

function emptyBook(){return{title:"",author:"",category:"",description:"",coverFile:null,pdfFile:null,quiz:[]};}
function emptyQuiz(){return{question:"",options:["","","",""],correct_index:0};}
function AccessRequired({setPage}){return <div className="empty accessBox"><Shield size={46}/><h2>Avval tizimga kiring</h2><p>Elektron kutubxonadan to‘liq foydalanish uchun ro‘yxatdan o‘ting yoki tizimga kiring.</p><button onClick={()=>setPage("login")}>Kirish / Ro‘yxatdan o‘tish</button></div>;}
function Stat({title,value}){return <div className="stat"><span>{title}</span><b>{value}</b></div>;}
function SectionTitle({title}){return <div className="sectionTitle"><h2>{title}</h2></div>;}
function Empty({text}){return <div className="empty">{text}</div>;}

createRoot(document.getElementById("root")).render(<App/>);
