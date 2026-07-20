const API_URL = window.location.origin;
//const API_URL = "http://127.0.0.1:8000";


let questionCount = 0;

/* ===================================
   INIT
=================================== */

window.onload = () => {
    loadDocuments();
};

/* ===================================
   UPLOAD PDF
=================================== */

document
.getElementById("uploadBtn")
.addEventListener(
    "click",
    uploadDocument
);



async function uploadDocument(){

    const file =
        document
        .getElementById("pdfFile")
        .files[0];

    if(!file){
        alert("Please select a PDF.");
        return;
    }

    const formData =
        new FormData();

    formData.append(
        "file",
        file
    );

    try{

        document
        .getElementById("statusText")
        .innerText = "Uploading...";

        const response =
            await fetch(
                `${API_URL}/upload`,
                {
                    method:"POST",
                    body:formData
                }
            );

        const data =
            await response.json();

        document
        .getElementById("pagesCount")
        .innerText =
        data.pages || 0;

        document
        .getElementById("chunksCount")
        .innerText =
        data.chunks || 0;

        document
        .getElementById("statusText")
        .innerText =
        "Indexed";

        loadDocuments();
        loadSuggestions();

        addSystemMessage(
            `📄 ${data.document} uploaded successfully`
        );

        document
        .getElementById(
            "pdfViewer"
        )
        .src =
        `${API_URL}/pdf`;

    }
    catch(error){

        console.error(error);

        document
        .getElementById("statusText")
        .innerText =
        "Failed";
    }
}

/* ===================================
   SUMMARY
=================================== */

document
.getElementById("summaryBtn")
.addEventListener(
    "click",
    loadSummary
);

async function loadSummary(){

    try{

        const response =
            await fetch(
                `${API_URL}/summary`,
                {
                    method:"POST"
                }
            );

        const data =
            await response.json();

        document
        .getElementById("summaryBox")
        .innerText =
        data.summary || "No summary available.";

    }
    catch(error){

        console.error(error);
    }
}

/* ===================================
   INSIGHTS
=================================== */

document
.getElementById("insightsBtn")
.addEventListener(
    "click",
    loadInsights
);

async function loadInsights(){

    try{

        const response =
            await fetch(
                `${API_URL}/insights`,
                {
                    method:"POST"
                }
            );

        const data =
            await response.json();

        document
        .getElementById("insightsBox")
        .innerText =
        data.insights || "No insights available.";

    }
    catch(error){

        console.error(error);
    }
}

/* ===================================
   SUGGESTIONS
=================================== */

async function loadSuggestions(){

    try{

        const response =
            await fetch(
                `${API_URL}/suggestions`,
                {
                    method:"POST"
                }
            );

        const data =
            await response.json();

        const box =
            document
            .getElementById(
                "suggestionsBox"
            );

        box.innerHTML = "";

        if(!data.questions) return;

        data.questions.forEach(q => {

            const chip =
                document.createElement(
                    "div"
                );

            chip.className =
                "question-chip";

            chip.innerText = q;

            chip.onclick = () =>
                askSuggestion(q);

            box.appendChild(chip);

        });

    }
    catch(error){

        console.error(error);
    }
}

function askSuggestion(q){

    document
    .getElementById("chatInput")
    .value = q;
}

/* ===================================
   DOCUMENTS
=================================== */

async function loadDocuments(){

    try{

        const response =
            await fetch(
                `${API_URL}/documents`
            );

        const data =
            await response.json();

        const list =
            document
            .getElementById(
                "documentsList"
            );

        list.innerHTML = "";

        if(!data.documents) return;

        data.documents.forEach(doc => {

            const item =
                document.createElement(
                    "div"
                );

            item.className =
                "document-item";

            item.innerText =
                `📄 ${doc}`;

            item.onclick = () =>
                selectDocument(doc);

            list.appendChild(item);

        });

        document
        .getElementById(
            "pdfViewer"
        )
        .src =
        `${API_URL}/pdf`;

        const doc1 =
        document.getElementById(
            "doc1Select"
        );

        const doc2 =
        document.getElementById(
            "doc2Select"
        );

        doc1.innerHTML = "";
        doc2.innerHTML = "";

        data.documents.forEach(doc=>{

            doc1.innerHTML += `
            <option>
                ${doc}
            </option>
            `;

            doc2.innerHTML += `
            <option>
                ${doc}
            </option>
            `;
        });

    }
    catch(error){

        console.error(error);
    }
}

async function selectDocument(doc){

    await fetch(
        `${API_URL}/select-document`,
        {
            method:"POST",
            headers:{
                "Content-Type":
                "application/json"
            },
            body:JSON.stringify({
                document:doc
            })
        }
    );

    document
    .getElementById(
        "pdfViewer"
    )
    .src =
    `${API_URL}/pdf`;

    loadHistory();
}

/* ===================================
   CHAT
=================================== */

document
.getElementById("sendBtn")
.addEventListener(
    "click",
    sendMessage
);

document
.getElementById("chatInput")
.addEventListener(
    "keypress",
    function(e){

        if(e.key === "Enter"){
            sendMessage();
        }

    }
);

async function sendMessage(){

    const input =
        document
        .getElementById(
            "chatInput"
        );

    const question =
        input.value.trim();

    if(!question) return;

    appendMessage(
        question,
        "user"
    );

    input.value = "";

    try{

        const response =
            await fetch(
                `${API_URL}/query`,
                {
                    method:"POST",
                    headers:{
                        "Content-Type":
                        "application/json"
                    },
                    body:JSON.stringify({
                        query:question
                    })
                }
            );

        const data =
            await response.json();

        appendMessage(
            data.response,
            "bot"
        );

        renderSources(
            data.sources
        );

        questionCount++;

        document
        .getElementById(
            "questionCount"
        )
        .innerText =
        questionCount;

        loadHistory();

        if(data.response){
            loadFollowups(question);
        }

    }
    catch(error){

        console.error(error);

        appendMessage(
            "Error communicating with server.",
            "bot"
        );
    }
}

/* ===================================
   CHAT UI
=================================== */

function appendMessage(
    text,
    sender
){

    const chat =
        document
        .getElementById(
            "chatMessages"
        );

    const message =
        document.createElement(
            "div"
        );

    message.className =
        sender;

    message.innerText =
        text;

    chat.appendChild(
        message
    );

    chat.scrollTop =
        chat.scrollHeight;
}

function addSystemMessage(text){

    appendMessage(
        text,
        "bot"
    );
}

/* ===================================
   SOURCES
=================================== */

function renderSources(sources){

    if(!sources) return;

    let html = `
    <div class="sources-box">
        <h4>Sources</h4>
    `;

    sources.forEach(s=>{

        html += `
        <div
            class="source-chip"
            onclick="jumpToPage(${s.page})"
        >
            📄 Page ${s.page}
        </div>
        `;
    });

    html += "</div>";

    document
    .getElementById("chatMessages")
    .innerHTML += html;
}


function jumpToPage(page){

    const viewer =
    document.getElementById(
        "pdfViewer"
    );

    viewer.src =
    `${API_URL}/pdf#page=${page}`;
}

/* ===================================
   HISTORY
=================================== */

async function loadHistory(){

    const response =
        await fetch(
            `${API_URL}/history`
        );

    const data =
        await response.json();

    const box =
        document
        .getElementById(
            "historyBox"
        );

    box.innerHTML = "";

    if(
        !data.history
    ) return;

    data.history
    .slice()
    .reverse()
    .forEach(item=>{

        box.innerHTML += `
        <div
        class="history-item"
        >
            ❓
            ${item.question}
        </div>
        `;
    });
}

/* ===================================
   FOLLOWUPS
=================================== */

async function loadFollowups(
    question
){

    try{

        const response =
            await fetch(
                `${API_URL}/followups`,
                {
                    method:"POST",
                    headers:{
                        "Content-Type":
                        "application/json"
                    },
                    body:JSON.stringify({
                        query:question
                    })
                }
            );

        const data =
            await response.json();

        const box =
            document
            .getElementById(
                "followupsBox"
            );

        box.innerHTML = "";

        if(!data.followups) return;

        data.followups.forEach(f => {

            if(!f.trim()) return;

            const chip =
                document.createElement(
                    "div"
                );

            chip.className =
                "question-chip";

            chip.innerText = f;

            chip.onclick = () =>
                askSuggestion(f);

            box.appendChild(chip);

        });

    }
    catch(error){

        console.error(error);
    }
}

document
.getElementById("exportBtn")
.addEventListener(
"click",
exportReport
);

async function exportReport(){

    const response =
        await fetch(
            `${API_URL}/export`,
            {
                method:"POST"
            }
        );

    const data =
        await response.json();

    alert(
        "Report Generated: " +
        data.file
    );
}

document
.getElementById("historyBtn")
.addEventListener(
    "click",
    loadHistory
);



function jumpToPage(page){

    document
    .getElementById(
        "pdfViewer"
    )
    .src =
    `${API_URL}/pdf#page=${page}`;
}


document
.getElementById(
    "compareBtn"
)
.addEventListener(
    "click",
    compareDocuments
);

async function compareDocuments(){

    const doc1 =
    document.getElementById(
        "doc1Select"
    ).value;

    const doc2 =
    document.getElementById(
        "doc2Select"
    ).value;

    const response =
    await fetch(
        `${API_URL}/compare`,
        {
            method:"POST",
            headers:{
                "Content-Type":
                "application/json"
            },
            body:JSON.stringify({
                doc1,
                doc2
            })
        }
    );

    const data =
    await response.json();

    document
    .getElementById(
        "comparisonResult"
    )
    .innerText =
    data.comparison;
}


document
.getElementById(
    "searchBtn"
)
.addEventListener(
    "click",
    searchDocument
);

async function searchDocument(){

    const query =
    document
    .getElementById(
        "searchInput"
    )
    .value;

    const response =
    await fetch(
        `${API_URL}/search`,
        {
            method:"POST",
            headers:{
                "Content-Type":
                "application/json"
            },
            body:JSON.stringify({
                query
            })
        }
    );

    const data =
    await response.json();

    let html="";

    data.results.forEach(r=>{

        html += `
        <div
            class="search-result"
            onclick="
            jumpToPage(${r.page})
            "
        >

        <b>
        Page ${r.page}
        </b>

        <br>

        ${r.snippet}

        </div>
        `;
    });

    document
    .getElementById(
        "searchResults"
    )
    .innerHTML =
    html;
}