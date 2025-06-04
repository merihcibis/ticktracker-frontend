import { useState, useEffect } from "react";

const redirectUri = 'https://' + chrome.runtime.id + '.chromiumapp.org';

export default function App() {
  const [selectedIssue, setSelectedIssue] = useState('');
  const [desc, setDesc] = useState('');
  const [presets, setPresets] = useState([]);
  const [accessToken, setAccessToken] = useState(null);
  const [issues, setIssues] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [timeSpent, setTimeSpent] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [serverOnline, setServerOnline] = useState(true);
  const [clientId, setClientId] = useState(null);
  const [apiBase, setApiBase] = useState(null);

  useEffect(() => {
    fetch('config.json')
      .then((res) => res.json())
      .then((data) => {
        setClientId(data.clientId);
        setApiBase(data.apiBase);
      })
      .catch((err) => console.error('Config load failed:', err));
  }, []);

  useEffect(() => {
    if (!apiBase) return; // Wait until config.json is loaded and apiBase is set
  
    // ✅ Backend health check
    fetch(`${apiBase}/api/ping`)
      .then(res => setServerOnline(res.ok))
      .catch(() => setServerOnline(false));
  
    chrome.storage.sync.get([
      'accessToken', 'expiresIn', 'tokenTimestamp', 'refreshToken', 'presets'
    ], async (result) => {
      const { accessToken, expiresIn, tokenTimestamp, refreshToken, presets } = result;
      if (presets) setPresets(presets);
  
      const isExpired = Date.now() - tokenTimestamp > expiresIn * 1000;
      let finalToken = accessToken;
  
      if (accessToken && !isExpired) {
        setAccessToken(accessToken);
        fetchIssues(accessToken);
      } else if (refreshToken) {
        try {
          const res = await fetch(`${apiBase}/api/refresh-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });
          const data = await res.json();
          if (data.access_token) {
            finalToken = data.access_token;
            chrome.storage.sync.set({
              accessToken: data.access_token,
              refreshToken: data.refresh_token || refreshToken,
              expiresIn: data.expires_in,
              tokenTimestamp: Date.now()
            }, () => {
              setAccessToken(data.access_token);
              fetchIssues(data.access_token);
            });
          }
        } catch (err) {
          console.error('Token refresh error:', err);
          setError('❌ Token refresh failed.');
        }
      }
  
      // 🔄 Sync any locally cached logs
      if (finalToken) {
        try {
          const pending = JSON.parse(localStorage.getItem('pendingLogs') || '[]');
          if (pending.length > 0) {
            const responses = await Promise.all(
              pending.map(log =>
                fetch(`${apiBase}/api/log-time`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${finalToken}`,
                  },
                  body: JSON.stringify(log),
                })
              )
            );
  
            const allSuccessful = responses.every(res => res.ok);
            if (allSuccessful) {
              console.log('✅ Pending logs synced.');
              localStorage.removeItem('pendingLogs');
              setSuccess('✅ Pending logs synced.');
            } else {
              console.warn('⚠️ Some pending logs failed to sync.');
            }
          }
        } catch (syncErr) {
          console.error('Sync error:', syncErr);
        }
      }
    });
  }, [apiBase]); // 👈 Only run after apiBase is loaded



  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setError('');
        setSuccess('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

  const fetchIssues = async (token) => {
    try {
      const response = await fetch(`${apiBase}/api/issues`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.issues) setIssues(data.issues);
    } catch (err) {
      console.error('Failed to fetch issues:', err);
      setError('❌ Failed to fetch issues.');
    }
  };

  const savePreset = () => {
    if (desc.trim() && !presets.includes(desc)) {
      const updated = [...presets, desc];
      setPresets(updated);
      chrome.storage.sync.set({ presets: updated });
    }
  };

  const deletePreset = (preset) => {
    const updated = presets.filter(p => p !== preset);
    setPresets(updated);
    chrome.storage.sync.set({ presets: updated });
  };

  const exchangeCodeForToken = (code) => {
    setError('');
    setSuccess('');

    fetch(`${apiBase}/api/exchange-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.access_token) {
          chrome.storage.sync.set({
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresIn: data.expires_in,
            tokenTimestamp: Date.now()
          }, () => {
            setAccessToken(data.access_token);
            fetchIssues(data.access_token);
            setSuccess("🔐 Connected to Jira!");
          });
        } else {
          setError("❌ Token exchange failed. Please retry.");
        }
      })
      .catch(err => {
        console.error('Token exchange error:', err);
        setError("❌ Authorization failed. Make sure you grant access.");
      });
  };

  const handleJiraAuth = () => {
    setError('');
    setSuccess('');

    const url = `https://auth.atlassian.com/authorize?audience=api.atlassian.com&client_id=${clientId}&scope=read:jira-work write:jira-work offline_access&redirect_uri=${redirectUri}&response_type=code&prompt=consent`;
    chrome.identity.launchWebAuthFlow({ url, interactive: true }, function (redirectUrl) {
      if (chrome.runtime.lastError || !redirectUrl) {
        console.warn('First attempt failed, retrying...');
        chrome.identity.launchWebAuthFlow({ url, interactive: true }, function (retryUrl) {
          if (retryUrl) {
            const code = new URL(retryUrl).searchParams.get("code");
            exchangeCodeForToken(code);
          } else {
            setError("❌ Authorization failed. Try again.");
          }
        });
      } else {
        const code = new URL(redirectUrl).searchParams.get("code");
        exchangeCodeForToken(code);
      }
    });
  };

  const handleLogTime = async () => {
    setError('');
    setSuccess('');
  
    if (!selectedIssue || !desc || !timeSpent || !date) {
      setError('⚠️ Please fill out all fields.');
      return;
    }
  
    if (!/\d+h(\s?\d+m)?$/.test(timeSpent.trim())) {
      setError('⏱️ Format: "1h 30m" or "2h" only.');
      return;
    }
  
    const logData = {
      issueKey: selectedIssue.split(' ')[0],
      comment: desc,
      timeSpent,
      date,
    };
  
    setLoading(true);
    try {
      const result = await new Promise((resolve) =>
        chrome.storage.sync.get(['accessToken', 'expiresIn', 'tokenTimestamp', 'refreshToken'], resolve)
      );
  
      let { accessToken, expiresIn, tokenTimestamp, refreshToken } = result;
      const isExpired = Date.now() - tokenTimestamp > expiresIn * 1000;
  
      if (isExpired && refreshToken) {
        const res = await fetch(`${apiBase}/api/refresh-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        const data = await res.json();
        if (data.access_token) {
          accessToken = data.access_token;
          chrome.storage.sync.set({
            accessToken,
            refreshToken: data.refresh_token || refreshToken,
            expiresIn: data.expires_in,
            tokenTimestamp: Date.now(),
          });
        } else {
          throw new Error('Refresh failed');
        }
      }
  
      const response = await fetch(`${apiBase}/api/log-time`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(logData),
      });
  
      const data = await response.json();
      if (data.success) {
        setSuccess('✅ Time logged!');
        setTimeSpent('');
      } else {
        throw new Error('Logging failed');
      }
    } catch (err) {
      console.error(err);
  
      // Store in localStorage for later sync
      try {
        const pending = JSON.parse(localStorage.getItem('pendingLogs') || '[]');
        pending.push(logData);
        localStorage.setItem('pendingLogs', JSON.stringify(pending));
        setSuccess('💾 Saved offline. Will sync later.');
      } catch (cacheErr) {
        console.error('Failed to cache log locally:', cacheErr);
        setError('❌ Could not save offline.');
      }
    }
  
    setLoading(false);
  };

  return (
    <div className="p-4 font-sans" style={{ width: '400px', overflow: 'hidden' }}>
      <h1 className="text-xl font-bold mb-3 text-center">TickTrack - Jira Time Logger</h1>

      {!serverOnline && (
        <div className="bg-red-100 text-red-700 text-sm px-3 py-2 rounded mb-3 text-center">
          ⚠️ Server unavailable. Check your backend.
        </div>
      )}
      <div className="mb-4">
        <label className="text-sm font-medium">Assigned Jira Issues</label>
        <select className="w-full p-2 border rounded" onChange={(e) => setSelectedIssue(e.target.value)} value={selectedIssue}>
          <option value="">Select issue</option>
          {issues.map((issue) => (
            <option key={issue.id} value={`${issue.key} - ${issue.fields.summary}`}>
              {issue.key}: {issue.fields.summary}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <label className="text-sm font-medium">Presets</label>
        <div className="flex items-center gap-2 mb-2">
          <select
            className="w-full p-2 border rounded"
            onChange={(e) => setDesc(e.target.value)}
            value={desc || ''}
          >
            <option value="" disabled>Select preset</option>
            {presets.map((preset, index) => (
              <option key={index} value={preset}>{preset}</option>
            ))}
          </select>
          <button
            className="text-red-600 text-sm px-2 py-1 border border-red-300 rounded hover:bg-red-100"
            disabled={!presets.includes(desc)}
            onClick={() => deletePreset(desc)}
            title="Delete selected preset"
          >
            🗑️
          </button>
        </div>
        <button className="bg-gray-200 text-sm px-2 py-1 rounded" onClick={savePreset}>
          ⭐ Save Current Description
        </button>
      </div>

      <textarea className="w-full p-2 border rounded mb-2" placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)} />

      <div className="mb-2">
        <label className="text-sm font-medium">Time Spent</label>
        <input type="text" className="w-full p-2 border rounded" placeholder="e.g. 1h 30m" value={timeSpent} onChange={(e) => setTimeSpent(e.target.value)} />
      </div>

      <div className="mb-4">
        <label className="text-sm font-medium">Date</label>
        <input type="date" className="w-full p-2 border rounded" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {error && <p className="text-red-600 mb-2 text-sm">{error}</p>}
      {success && <p className="text-green-600 mb-2 text-sm">{success}</p>}

      {loading && (
        <div className="flex justify-center items-center my-2">
          <svg className="animate-spin h-5 w-5 text-gray-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <span className="ml-2 text-sm text-gray-600">Logging time...</span>
        </div>
      )}

      <button onClick={handleLogTime} disabled={loading} className={`${loading ? 'opacity-50 cursor-not-allowed' : ''} bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded w-full`}>
        🕒 {loading ? 'Logging...' : 'Log Time to Jira'}
      </button>

      <button onClick={handleJiraAuth} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded mt-2">
        Connect Jira (OAuth)
      </button>
    </div>
  );
}
