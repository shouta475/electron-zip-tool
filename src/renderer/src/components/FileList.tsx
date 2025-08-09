// import { useState } from "react";

const FileList = () => {
  // const [files, setFiles] = useState(["テスト1.txt", "test2.txt", "dir/test.txt", "xxx/yyy.txt"]);
  return (
    <>
      <ul>
        {["テスト1.txt", "test2.txt", "dir/test.txt", "xxx/yyy.txt"].map((file) => (
          <>
            <li>{file}</li>
            <button>編集(笑)</button>
          </>
        ))}
      </ul>
    </>
  );
};

export default FileList;