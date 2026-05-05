// ===== Conversation Branching =====
// Edit an old user message or "fork from here" to create an alternative
// branch. Each conversation can have a tree of branches, navigated via
// breadcrumb arrows.

(function () {
    'use strict';

    // Branch data is stored inside each conversation in AIHubHistory.
    // A conversation's `messages` array is the *active path*. Branches are
    // stored as `branches: [{ parentIndex, messages: [...] }]`.
    // We store a `branchIndex` on the conversation to track which branch
    // path we're displaying.

    function getConv() {
        if (!window.AIHubHistory) return null;
        return window.AIHubHistory.activeConversation();
    }

    // Initialize branch metadata on a conversation if missing
    function ensureBranches(conv) {
        if (!conv) return;
        if (!conv.branches) conv.branches = [];
        if (conv.activeBranch === undefined) conv.activeBranch = -1; // -1 = main
    }

    // Fork from a specific message index: keep messages 0..index, create a
    // new branch with the remaining messages, then clear from index+1.
    function forkAt(messageIndex) {
        const conv = getConv();
        if (!conv) return;
        ensureBranches(conv);

        // Save the current tail as a branch
        if (conv.messages.length > messageIndex + 1) {
            const branchMessages = conv.messages.slice(messageIndex + 1);
            conv.branches.push({
                parentIndex: messageIndex,
                messages: branchMessages,
                ts: Date.now(),
            });
        }

        // Truncate main to the fork point
        conv.messages = conv.messages.slice(0, messageIndex + 1);
        conv.activeBranch = -1;

        if (window.AIHubHistory) window.AIHubHistory.saveAll();
        refreshUI();
    }

    // Edit a user message at index: fork first, then replace the message
    function editMessage(messageIndex, newText) {
        const conv = getConv();
        if (!conv || !conv.messages[messageIndex]) return;
        if (conv.messages[messageIndex].role !== 'user') return;

        // Fork to save the old timeline
        forkAt(messageIndex - 1 >= 0 ? messageIndex - 1 : 0);

        // Now messages[messageIndex] doesn't exist (we truncated). 
        // Add the edited message back.
        const html = window.escapeHtml ? window.escapeHtml(newText) : newText;
        conv.messages.push({ role: 'user', html, ts: Date.now() });
        if (window.AIHubHistory) window.AIHubHistory.saveAll();
        refreshUI();

        // Re-send the edited message to get a new response
        return newText;
    }

    // Switch to a different branch at a given fork point
    function switchBranch(parentIndex, branchIdx) {
        const conv = getConv();
        if (!conv) return;
        ensureBranches(conv);

        // Find branches at this parent index
        const branches = conv.branches.filter(b => b.parentIndex === parentIndex);
        if (branchIdx < 0 || branchIdx >= branches.length) return;

        // Save current tail as a branch (if different from what we're switching to)
        const currentTail = conv.messages.slice(parentIndex + 1);
        if (currentTail.length > 0) {
            // Check if this tail is already saved
            const alreadySaved = conv.branches.some(b =>
                b.parentIndex === parentIndex &&
                b.messages.length === currentTail.length &&
                b.messages[0].ts === currentTail[0].ts
            );
            if (!alreadySaved) {
                conv.branches.push({
                    parentIndex,
                    messages: currentTail,
                    ts: Date.now(),
                });
            }
        }

        // Replace current tail with the selected branch
        conv.messages = conv.messages.slice(0, parentIndex + 1).concat(branches[branchIdx].messages);
        if (window.AIHubHistory) window.AIHubHistory.saveAll();
        refreshUI();
    }

    // Get branch info at a given message index (for breadcrumb display)
    function getBranchInfo(messageIndex) {
        const conv = getConv();
        if (!conv || !conv.branches) return null;

        const branches = conv.branches.filter(b => b.parentIndex === messageIndex);
        if (branches.length === 0) return null;

        return {
            count: branches.length + 1, // +1 for current path
            branches,
        };
    }

    // Add edit/fork controls to a message element
    function addBranchControls(msgDiv, messageIndex) {
        if (!msgDiv || msgDiv.querySelector('.branch-controls')) return;
        const conv = getConv();
        if (!conv || !conv.messages[messageIndex]) return;

        const controls = document.createElement('div');
        controls.className = 'branch-controls';

        const msg = conv.messages[messageIndex];

        // Edit button for user messages
        if (msg.role === 'user') {
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'branch-btn branch-edit';
            editBtn.title = 'Edit message';
            editBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
            editBtn.addEventListener('click', () => startEditUI(msgDiv, messageIndex));
            controls.appendChild(editBtn);
        }

        // Fork button for any message
        const forkBtn = document.createElement('button');
        forkBtn.type = 'button';
        forkBtn.className = 'branch-btn branch-fork';
        forkBtn.title = 'Fork from here';
        forkBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3v12"/><path d="M18 9a3 3 0 100-6 3 3 0 000 6z"/><path d="M6 21a3 3 0 100-6 3 3 0 000 6z"/><path d="M18 9c0 6-12 6-12 12"/></svg>';
        forkBtn.addEventListener('click', () => {
            forkAt(messageIndex);
            const input = document.getElementById('chat-input');
            if (input) input.focus();
            if (window.showToast) window.showToast('Forked conversation');
        });
        controls.appendChild(forkBtn);

        // Branch navigator (breadcrumb arrows)
        const branchInfo = getBranchInfo(messageIndex);
        if (branchInfo) {
            const nav = document.createElement('span');
            nav.className = 'branch-nav';

            const leftBtn = document.createElement('button');
            leftBtn.type = 'button';
            leftBtn.className = 'branch-nav-btn';
            leftBtn.innerHTML = '&larr;';
            leftBtn.addEventListener('click', () => {
                const branches = branchInfo.branches;
                const currentIdx = branches.length - 1;
                if (currentIdx > 0) switchBranch(messageIndex, currentIdx - 1);
            });

            const label = document.createElement('span');
            label.className = 'branch-nav-label';
            label.textContent = `1/${branchInfo.count}`;

            const rightBtn = document.createElement('button');
            rightBtn.type = 'button';
            rightBtn.className = 'branch-nav-btn';
            rightBtn.innerHTML = '&rarr;';
            rightBtn.addEventListener('click', () => {
                const branches = branchInfo.branches;
                switchBranch(messageIndex, 0);
            });

            nav.appendChild(leftBtn);
            nav.appendChild(label);
            nav.appendChild(rightBtn);
            controls.appendChild(nav);
        }

        msgDiv.appendChild(controls);
    }

    // Show inline edit UI for a user message
    function startEditUI(msgDiv, messageIndex) {
        const bubble = msgDiv.querySelector('.msg-bubble');
        if (!bubble) return;

        const originalText = bubble.innerText;
        const textarea = document.createElement('textarea');
        textarea.className = 'branch-edit-textarea';
        textarea.value = originalText;
        textarea.rows = Math.min(6, Math.max(2, originalText.split('\n').length));

        const btnRow = document.createElement('div');
        btnRow.className = 'branch-edit-actions';

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'branch-edit-save';
        saveBtn.textContent = 'Save & Resend';
        saveBtn.addEventListener('click', async () => {
            const newText = textarea.value.trim();
            if (!newText) return;
            editMessage(messageIndex, newText);
            // Trigger sendChat with the new message
            const input = document.getElementById('chat-input');
            if (input) {
                input.value = newText;
                if (typeof window.sendChat === 'function') window.sendChat();
            }
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'branch-edit-cancel';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => refreshUI());

        btnRow.appendChild(saveBtn);
        btnRow.appendChild(cancelBtn);

        bubble.innerHTML = '';
        bubble.appendChild(textarea);
        bubble.appendChild(btnRow);
        textarea.focus();
    }

    function refreshUI() {
        if (typeof window.restoreActiveConversation === 'function') {
            window.restoreActiveConversation();
        }
    }

    // Expose
    window.AIHubBranch = {
        forkAt,
        editMessage,
        switchBranch,
        getBranchInfo,
        addBranchControls,
    };
})();
