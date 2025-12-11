"use client";

import Link from "next/link";
import { useAuth } from "./components/AuthProvider";

export default function HomePage() {
  const { user, loading } = useAuth();

  return (
    <div className="app-container">
      {/* 🔥 Debug 區：確認匿名登入是否成功 */}
      <div className="text-xs text-gray-500 p-2">
        {loading ? (
          <span>登入中…</span>
        ) : (
          <>
            <span>UID：{user?.uid}</span>
            <span className="ml-2">
              ({user?.isAnonymous ? "匿名登入" : "其他登入方式"})
            </span>
          </>
        )}
      </div>
      {/* Debug 區結束 */}

      <header className="site-header">
        <div className="logo">muu space 心理探索</div>
      </header>

      <main className="main-content">
        <section className="hero-section">
          <h1 className="hero-title">muu space</h1>
          <p className="hero-subtitle">
            讓故事被聽見，也讓最近的自己有地方停一下。
          </p>
        </section>

        <section className="input-section">
          <div className="input-wrapper">
            <textarea
              className="poetic-input"
              placeholder="今天發生了什麼事？寫給自己聽聽看。"
            />
            <div className="input-actions">
              <button className="btn btn-primary btn-submit">送出</button>
            </div>
          </div>
        </section>

        <section className="cards-grid">
          {/* Card 1: Story Wall */}
          <article className="card story-card">
            <div className="card-content">
              <h2 className="card-title">故事牆</h2>
              <p className="card-description">
                收集很多人的真實片段，像一面會呼吸的牆。
              </p>
              <div className="card-actions">
                <Link href="/stories">
                  <button className="btn btn-primary">看看大家的故事</button>
                </Link>
                <Link href="/stories">
                  <button className="btn btn-secondary">分享一個故事</button>
                </Link>
              </div>
            </div>
          </article>

          {/* Card 2: Share Recent Self */}
          <article className="card self-card">
            <div className="card-content">
              <h2 className="card-title">分享最近的自己</h2>
              <p className="card-description">
                如果想整理一下現在的你，可以從這裡慢慢開始。
              </p>
              <div className="card-actions">
                <Link href="/me">
                  <button className="btn btn-primary">走進我的頁面</button>
                </Link>
                <Link href="/me">
                  <button className="btn btn-secondary">寫一段新的</button>
                </Link>
              </div>
            </div>
          </article>
        </section>
      </main>

      <footer className="site-footer">
        <p>&copy; muu space 心理探索</p>
      </footer>
    </div>
  );
}
