// FILE: src/App.js
import React from 'react';
import MentorshipForm from './components/MentorshipForm';
import AdminPanel from './pages/AdminPanel';

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const showAdmin = params.get('admin') === '1';

  return showAdmin ? <AdminPanel /> : <MentorshipForm />;
}
