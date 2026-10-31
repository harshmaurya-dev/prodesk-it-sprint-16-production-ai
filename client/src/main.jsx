import React, { Component, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import './styles.css';

const API = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(localStorage.getItem('token')
        ? { Authorization: `Bearer ${localStorage.getItem('token')}` }
        : {}),
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
    throw new Error(data.message || 'Request failed. Please try again.');
  }
  return data;
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('Application error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="auth">
          <section className="card">
            <b className="logo">PRODESK <i>IT</i></b>
            <h1>Something went wrong</h1>
            <p>The page hit an unexpected error. Reload the app to continue.</p>
            <button onClick={() => window.location.reload()}>Reload application</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

function Toast({ message, onClose }) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(onClose, 3500);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      <span>{message}</span>
      <button className="toast-close" onClick={onClose} aria-label="Dismiss notification">×</button>
    </div>
  );
}

function Auth({ register = false }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await apiRequest(`/auth/${register ? 'register' : 'login'}`, {
        method: 'POST',
        body: JSON.stringify(form),
      });
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      navigate('/dashboard');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <section className="card">
        <b className="logo">PRODESK <i>IT</i></b>
        <span className="eyebrow">SPRINT 16 · PRODUCTION + AI</span>
        <h1>{register ? 'Create your workspace' : 'Welcome back'}</h1>
        <p>Manage employee records with secure access and AI-powered insights.</p>
        <form onSubmit={submit}>
          {register && (
            <input
              required
              maxLength="80"
              placeholder="Full name"
              autoComplete="name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          )}
          <input
            required
            type="email"
            placeholder="Email address"
            autoComplete="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
          <input
            required
            minLength="8"
            type="password"
            placeholder="Password (minimum 8 characters)"
            autoComplete={register ? 'new-password' : 'current-password'}
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
          {error && <div className="error" role="alert">{error}</div>}
          <button disabled={busy}>{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</button>
        </form>
        <button className="secondary full-width" onClick={() => navigate(register ? '/login' : '/register')}>
          {register ? 'Already have an account? Sign in' : 'New here? Create an account'}
        </button>
      </section>
    </main>
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState({ name: '', role: '', department: 'Engineering', email: '' });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [insights, setInsights] = useState(null);
  const [toast, setToast] = useState('');

  async function loadEmployees() {
    setLoading(true);
    try {
      const data = await apiRequest('/employees');
      setEmployees(data);
    } catch (error) {
      setToast(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEmployees();
  }, []);

  function resetForm() {
    setForm({ name: '', role: '', department: 'Engineering', email: '' });
    setEditingId(null);
  }

  async function saveEmployee(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const data = await apiRequest(editingId ? `/employees/${editingId}` : '/employees', {
        method: editingId ? 'PUT' : 'POST',
        body: JSON.stringify(form),
      });
      setEmployees((current) => editingId
        ? current.map((item) => item._id === data._id ? data : item)
        : [data, ...current]);
      setToast(editingId ? 'Employee updated successfully' : 'Employee added successfully');
      resetForm();
    } catch (error) {
      setToast(error.message);
    } finally {
      setSaving(false);
    }
  }

  function editEmployee(employee) {
    setEditingId(employee._id);
    setForm({
      name: employee.name,
      role: employee.role,
      department: employee.department,
      email: employee.email,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function deleteEmployee(id) {
    if (!window.confirm('Are you sure you want to delete this employee?')) return;
    try {
      await apiRequest(`/employees/${id}`, { method: 'DELETE' });
      setEmployees((current) => current.filter((item) => item._id !== id));
      setToast('Employee deleted successfully');
    } catch (error) {
      setToast(error.message);
    }
  }

  async function generateInsights() {
    setAiLoading(true);
    try {
      const data = await apiRequest('/ai/insights', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setInsights(data.insights);
      setToast('AI insights are ready');
    } catch (error) {
      setToast(error.message);
    } finally {
      setAiLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div>
          <b className="logo">PRODESK <i>IT</i></b>
          <span className="eyebrow sidebar-label">SPRINT 16</span>
          <h2>Production Workspace</h2>
          <p>Security hardening, structured logging and server-side AI enrichment.</p>
        </div>
        <div className="sidebar-actions">
          <button onClick={generateInsights} disabled={aiLoading}>
            {aiLoading ? 'Generating insights…' : 'Generate AI Summary'}
          </button>
          <button className="secondary" onClick={logout}>Sign out</button>
        </div>
      </aside>

      <main className="content">
        <header className="page-header">
          <div>
            <span className="eyebrow">PRODUCTION DASHBOARD</span>
            <h1>Hello, {user.name || 'there'} 👋</h1>
            <p>Manage your team and review AI-generated insights.</p>
          </div>
          <div className="stat-card">
            <strong>{employees.length}</strong>
            <span>Employees</span>
          </div>
        </header>

        <Toast message={toast} onClose={() => setToast('')} />

        <div className="dashboard-grid">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">EMPLOYEE MANAGEMENT</span>
                <h2>{editingId ? 'Update employee' : 'Add an employee'}</h2>
              </div>
            </div>
            <form onSubmit={saveEmployee}>
              <label>Full name<input required maxLength="100" placeholder="e.g. Alex Morgan" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label>Job role<input required maxLength="100" placeholder="e.g. Product Designer" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} /></label>
              <label>Department
                <select value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })}>
                  {['Engineering', 'Design', 'Sales', 'Marketing', 'Operations', 'Human Resources', 'Finance'].map((department) => <option key={department}>{department}</option>)}
                </select>
              </label>
              <label>Email address<input required type="email" placeholder="alex@company.com" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
              <div className="form-actions">
                <button disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add employee'}</button>
                {editingId && <button type="button" className="secondary" onClick={resetForm}>Cancel</button>}
              </div>
            </form>
          </section>

          <section className="panel insights-panel">
            <span className="eyebrow">AI ASSISTANT</span>
            <h2>Team insights</h2>
            {insights ? (
              <>
                <p className="insight-summary">{insights.summary}</p>
                <h3>Recommendations</h3>
                {insights.recommendations?.length ? (
                  <ul>{insights.recommendations.map((item, index) => <li key={index}>{item}</li>)}</ul>
                ) : <p>No recommendations available right now.</p>}
              </>
            ) : (
              <div className="empty-insights">
                <span className="ai-icon">✦</span>
                <p>Generate a quick summary of your team and get practical recommendations. Your AI provider key stays on the server.</p>
                <button className="secondary" onClick={generateInsights} disabled={aiLoading}>
                  {aiLoading ? 'Working…' : 'Generate insights'}
                </button>
              </div>
            )}
          </section>
        </div>

        <section className="panel directory-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">YOUR TEAM</span>
              <h2>Employee directory</h2>
            </div>
            <span className="directory-count">{employees.length} records</span>
          </div>
          {loading ? (
            <div className="loading-state"><span className="spinner" /> Loading employee records…</div>
          ) : employees.length === 0 ? (
            <div className="empty-state">No employees added yet. Use the form to create your first record.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Employee</th><th>Role</th><th>Department</th><th>Actions</th></tr></thead>
                <tbody>
                  {employees.map((employee) => (
                    <tr key={employee._id}>
                      <td><strong>{employee.name}</strong><small>{employee.email}</small></td>
                      <td>{employee.role}</td>
                      <td><span className="tag">{employee.aiTag || employee.department}</span></td>
                      <td className="table-actions">
                        <button className="small-button secondary" onClick={() => editEmployee(employee)}>Edit</button>
                        <button className="small-button danger" onClick={() => deleteEmployee(employee._id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <footer>Prodesk IT · Sprint 16 · Production-ready workflow</footer>
      </main>
    </div>
  );
}

function ProtectedRoute({ children }) {
  return localStorage.getItem('token') ? children : <Navigate to="/login" replace />;
}

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={<Auth />} />
        <Route path="/register" element={<Auth register />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter><App /></BrowserRouter>,
);
