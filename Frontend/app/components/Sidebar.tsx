"use client";

export default function Sidebar() {
  return (
    <div className="flex flex-col space-y-2">
      <h3 className="text-lg font-bold mb-4">Files</h3>
      <ul className="space-y-2">
        <li>index.js</li>
        <li>app.js</li>
        <li>style.css</li>
      </ul>
    </div>
  );
}
