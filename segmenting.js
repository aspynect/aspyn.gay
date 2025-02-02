segments = document.querySelectorAll(".replaceme");

for (const segment of segments) {
    fetch(`/assets/segments/${segment.nodeName.toLowerCase()}.html`)
        .then(response => response.text())
        .then(html => {
            segment.outerHTML = html
        })
        .catch(error => console.error("Error loading segment:", error));
}