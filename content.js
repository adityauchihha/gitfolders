function createFolderInterface() {
    const folderInterface = document.createElement('div');
    folderInterface.className = 'folder-interface';
    folderInterface.innerHTML = `
        <h2>Folder Management</h2>
        <div class="folder-form">
            <input type="text" id="newFolderName" placeholder="New folder name">
            <button id="addFolderBtn">Add Folder</button>
        </div>
        <div id="folderList" class="folder-list"></div>
        <div class="unsorted-repos">
            <h3>Unsorted Repositories</h3>
            <div id="repoList" class="repo-list-custom"></div>
        </div>
    `;
    return folderInterface;
}

async function saveFolderState() {
    const folderList = document.querySelector('#folderList');
    const state = {
        folders: Array.from(folderList.querySelectorAll('.folder-item')).map(folder => ({
            name: folder.querySelector('.folder-name').textContent,
            repos: Array.from(folder.querySelector('.folder-repo-list').children).map(repo => ({
                name: repo.querySelector('.repo-name').textContent,
                description: repo.querySelector('.repo-description')?.textContent || '',
                url: repo.querySelector('.repo-details').getAttribute('data-url')
            }))
        }))
    };
    
    await chrome.storage.local.set({ folderState: state });
}

async function loadFolderState(folderList, repoList) {
    const state = await chrome.storage.local.get('folderState');
    if (!state.folderState) return;

    // Recreate folders
    state.folderState.folders.forEach(folderData => {
        const folder = document.createElement('div');
        folder.className = 'folder-item';
        folder.innerHTML = `
            <div class="folder-header">
                <span class="folder-toggle">▶</span>
                <span class="folder-icon">📁</span>
                <span class="folder-name">${folderData.name}</span>
                <button class="delete-folder">❌</button>
            </div>
            <div class="folder-repo-list collapsed"></div>
        `;

        // Add folder functionality
        const toggle = folder.querySelector('.folder-toggle');
        const repoListEl = folder.querySelector('.folder-repo-list');
        toggle.addEventListener('click', () => {
            toggle.textContent = toggle.textContent === '▶' ? '▼' : '▶';
            repoListEl.classList.toggle('collapsed');
        });

        folder.querySelector('.delete-folder').addEventListener('click', handleFolderDeletion(folder, repoList));

        // Add repos to folder
        folderData.repos.forEach(repoData => {
            const repoElement = document.createElement('div');
            repoElement.className = 'repo-item';
            repoElement.style.cursor = 'pointer';
            repoElement.innerHTML = `
                <span class="repo-icon">📦</span>
                <div class="repo-details" data-url="${repoData.url}">
                    <span class="repo-name">${repoData.name}</span>
                    <span class="repo-description">${repoData.description}</span>
                </div>
                <button class="return-to-unsorted" title="Return to unsorted">↩</button>
            `;

            repoElement.querySelector('.repo-details').addEventListener('click', () => {
                if (repoData.url) window.location.href = repoData.url;
            });

            repoElement.querySelector('.return-to-unsorted').addEventListener('click', async (e) => {
                e.stopPropagation();
                const unsortedRepo = createUnsortedRepo(repoData);
                repoList.appendChild(unsortedRepo);
                repoElement.remove();
                attachFolderSelectionHandler(unsortedRepo);
                await saveFolderState();
            });

            repoListEl.appendChild(repoElement);
        });

        folderList.appendChild(folder);
    });
}

function createUnsortedRepo(repoData) {
    const repo = document.createElement('div');
    repo.className = 'repo-item';
    repo.style.cursor = 'pointer';
    repo.innerHTML = `
        <span class="repo-icon">📦</span>
        <div class="repo-details" data-url="${repoData.url}">
            <span class="repo-name">${repoData.name}</span>
            <span class="repo-description">${repoData.description}</span>
        </div>
        <button class="add-to-folder" title="Add to folder">+</button>
    `;

    repo.querySelector('.repo-details').addEventListener('click', () => {
        if (repoData.url) window.location.href = repoData.url;
    });

    return repo;
}

async function fetchUserRepos() {
    try {
        const username = document.querySelector('meta[name="octolytics-actor-login"]')?.content;
        if (!username) return [];
        
        let page = 1;
        let allRepos = [];
        
        while (true) {
            const response = await fetch(
                `https://api.github.com/users/${username}/repos?per_page=100&page=${page}`,
                { headers: { 'Accept': 'application/vnd.github.v3+json' } }
            );
            
            if (!response.ok) break;
            
            const repos = await response.json();
            if (repos.length === 0) break;
            
            allRepos = [...allRepos, ...repos];
            page++;
        }
        
        return allRepos.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    } catch (error) {
        console.error('Error fetching repos:', error);
        return [];
    }
}

async function displayUserRepos(repoListElement) {
    const repos = await fetchUserRepos();
    
    repos.forEach(repo => {
        const repoElement = document.createElement('div');
        repoElement.className = 'repo-item';
        repoElement.innerHTML = `
            <span class="repo-icon">📦</span>
            <div class="repo-details">
                <span class="repo-name">${repo.name}</span>
                <span class="repo-description">${repo.description || ''}</span>
            </div>
        `;
        repoListElement.appendChild(repoElement);
    });
}

function handleFolderDeletion(folder, repoList) {
    return async () => {
        if (confirm('Are you sure you want to delete this folder? It will not delete your repositories.')) {
            // Remove any open dropdowns that might show the folder being deleted
            document.querySelectorAll('.folder-dropdown').forEach(d => d.remove());
            
            // Get repos in this folder and move them back to unsorted
            const reposToMove = folder.querySelectorAll('.repo-item');
            
            reposToMove.forEach(repo => {
                const repoData = {
                    name: repo.querySelector('.repo-name').textContent,
                    description: repo.querySelector('.repo-description')?.textContent || '',
                    url: repo.querySelector('.repo-details').getAttribute('data-url')
                };
                const unsortedRepo = createUnsortedRepo(repoData);
                repoList.appendChild(unsortedRepo);
                attachFolderSelectionHandler(unsortedRepo);
            });

            folder.remove();
            await saveFolderState();
        }
    };
}

function handleFolderCreation(folderList) {
    const input = document.getElementById('newFolderName');
    const addBtn = document.getElementById('addFolderBtn');

    addBtn.addEventListener('click', async () => {
        if (input.value.trim()) {
            const folder = document.createElement('div');
            folder.className = 'folder-item';
            folder.innerHTML = `
                <div class="folder-header">
                    <span class="folder-toggle">▶</span>
                    <span class="folder-icon">📁</span>
                    <span class="folder-name">${input.value}</span>
                    <button class="delete-folder">❌</button>
                </div>
                <div class="folder-repo-list collapsed"></div>
            `;

            const toggle = folder.querySelector('.folder-toggle');
            const repoList = folder.querySelector('.folder-repo-list');
            toggle.addEventListener('click', () => {
                toggle.textContent = toggle.textContent === '▶' ? '▼' : '▶';
                repoList.classList.toggle('collapsed');
            });

            // Update folder deletion handler
            folder.querySelector('.delete-folder').addEventListener('click', handleFolderDeletion(folder, document.querySelector('#repoList')));

            folderList.appendChild(folder);
            input.value = '';
            await saveFolderState();
        }
    });
}

// ...existing code...

function createFolderDropdown(folders) {
    // Get unique folder names to prevent duplicates
    const uniqueFolderNames = new Set();
    const activeFolders = Array.from(folders)
        .filter(folder => {
            if (!folder.isConnected) return false;
            const folderName = folder.querySelector('.folder-name').textContent;
            if (uniqueFolderNames.has(folderName)) return false;
            uniqueFolderNames.add(folderName);
            return true;
        });
    
    const dropdown = document.createElement('div');
    dropdown.className = 'folder-dropdown';
    dropdown.innerHTML = `
        <div class="dropdown-content">
            ${activeFolders.map(folder => `
                <div class="dropdown-item" data-folder-name="${folder.querySelector('.folder-name').textContent}">
                    📁 ${folder.querySelector('.folder-name').textContent}
                </div>
            `).join('')}
        </div>
    `;
    return dropdown;
}

// ...existing code...

function moveRepoToFolder(repoElement, targetFolder) {
    // Create a clean repo element instead of cloning
    const repoDetails = repoElement.querySelector('.repo-details');
    const repoUrl = repoDetails.getAttribute('data-url');
    
    const repoClone = document.createElement('div');
    repoClone.className = 'repo-item';
    repoClone.style.cursor = 'pointer';
    repoClone.innerHTML = `
        <span class="repo-icon">📦</span>
        <div class="repo-details" data-url="${repoUrl}">
            ${repoDetails.innerHTML}
        </div>
        <button class="return-to-unsorted" title="Return to unsorted">↩</button>
    `;

    // Add click functionality for repository navigation
    repoClone.querySelector('.repo-details').addEventListener('click', () => {
        if (repoUrl) window.location.href = repoUrl;
    });

    // Get repository list and show folder content
    const folderRepoList = targetFolder.querySelector('.folder-repo-list');
    const toggle = targetFolder.querySelector('.folder-toggle');
    toggle.textContent = '▼';
    folderRepoList.classList.remove('collapsed');

    // Add to folder and remove from unsorted
    folderRepoList.appendChild(repoClone);
    repoElement.remove();
    saveFolderState();  // Save after moving repo

    // Handle return to unsorted
    repoClone.querySelector('.return-to-unsorted').addEventListener('click', async (e) => {
        e.stopPropagation();
        const unsortedList = document.querySelector('#repoList');
        
        // Create a clean copy for unsorted list
        const originalRepo = document.createElement('div');
        originalRepo.className = 'repo-item';
        originalRepo.style.cursor = 'pointer';
        originalRepo.innerHTML = `
            <span class="repo-icon">📦</span>
            <div class="repo-details" data-url="${repoUrl}">
                ${repoDetails.innerHTML}
            </div>
            <button class="add-to-folder" title="Add to folder">+</button>
        `;

        // Add click functionality
        originalRepo.querySelector('.repo-details').addEventListener('click', () => {
            if (repoUrl) window.location.href = repoUrl;
        });
        
        unsortedList.appendChild(originalRepo);
        repoClone.remove();
        
        // Reattach folder selection handler
        attachFolderSelectionHandler(originalRepo);
        await saveFolderState();  // Save after returning repo
    });
}

function attachFolderSelectionHandler(repoElement) {
    const addButton = repoElement.querySelector('.add-to-folder');
    if (!addButton) return;

    addButton.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Remove any existing dropdowns
        document.querySelectorAll('.folder-dropdown').forEach(d => d.remove());
        
        const folders = document.querySelectorAll('.folder-item');
        if (folders.length === 0) {
            alert('Please create a folder first');
            return;
        }

        const dropdown = createFolderDropdown(folders);
        repoElement.appendChild(dropdown);

        // Handle folder selection
        dropdown.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const folderName = item.getAttribute('data-folder-name');
                const targetFolder = Array.from(folders).find(
                    f => f.querySelector('.folder-name').textContent === folderName
                );
                
                if (targetFolder) {
                    moveRepoToFolder(repoElement, targetFolder);
                }
                dropdown.remove();
            });
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', function closeDropdown(e) {
            if (!dropdown.contains(e.target) && e.target !== addButton) {
                dropdown.remove();
                document.removeEventListener('click', closeDropdown);
            }
        });
    });
}

// Add this new function to get repos that are already in folders
function getReposInFolders() {
    const folderRepos = new Set();
    document.querySelectorAll('.folder-repo-list .repo-item').forEach(repo => {
        const repoUrl = repo.querySelector('.repo-details').getAttribute('data-url');
        if (repoUrl) folderRepos.add(repoUrl);
    });
    return folderRepos;
}

// Modify moveExistingRepos to skip repos that are already in folders
function moveExistingRepos(repoListElement, originalRepoList) {
    const repos = originalRepoList.querySelectorAll('li.public, li.private');
    const reposInFolders = getReposInFolders();
    
    repos.forEach(repo => {
        const repoLink = repo.querySelector('a[itemprop="name codeRepository"]');
        const repoUrl = repoLink?.href;
        
        // Skip if repo is already in a folder
        if (repoUrl && reposInFolders.has(repoUrl)) return;
        
        const repoName = repoLink?.textContent.trim();
        const repoDesc = repo.querySelector('p[itemprop="description"]')?.textContent.trim();
        
        const repoElement = document.createElement('div');
        repoElement.className = 'repo-item';
        repoElement.style.cursor = 'pointer';
        repoElement.innerHTML = `
            <span class="repo-icon">📦</span>
            <div class="repo-details" data-url="${repoUrl || ''}">
                <span class="repo-name">${repoName || ''}</span>
                <span class="repo-description">${repoDesc || ''}</span>
            </div>
            <button class="add-to-folder" title="Add to folder">+</button>
        `;

        // Add click event to navigate to repository
        const repoDetails = repoElement.querySelector('.repo-details');
        repoDetails.addEventListener('click', () => {
            if (repoUrl) window.location.href = repoUrl;
        });

        repoListElement.appendChild(repoElement);
        attachFolderSelectionHandler(repoElement);
    });
}

// Modify hideRepositories to handle the loading order correctly
function hideRepositories() {
    const repoElements = document.querySelectorAll([
        '[data-filterable-for="your-repos-filter"]',
        '.js-responsive-underlinenav + div',
        '.org-repos',
        '.user-repos-list',
        '#user-repositories-list',
        '[data-tab-container="repositories"]',
        '.repository-content',
        '.repo-list'
    ].join(','));
    
    repoElements.forEach(async element => {
        if (element && !element.classList.contains('hidden-by-extension')) {
            element.style.display = 'none';
            element.classList.add('hidden-by-extension');
            
            const folderInterface = createFolderInterface();
            element.parentNode.insertBefore(folderInterface, element);
            
            const folderList = folderInterface.querySelector('#folderList');
            const repoList = folderInterface.querySelector('#repoList');
            
            handleFolderCreation(folderList);
            
            // First load the saved state
            await loadFolderState(folderList, repoList);
            
            // Then add only the repos that aren't already in folders
            moveExistingRepos(repoList, element);
        }
    });
}

// Run immediately and every 100ms for the first second
hideRepositories();
for (let i = 1; i <= 10; i++) {
    setTimeout(hideRepositories, i * 100);
}

// Monitor for dynamic content changes
const observer = new MutationObserver(hideRepositories);
observer.observe(document.body, { childList: true, subtree: true });
