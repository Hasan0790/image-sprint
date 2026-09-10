let worker;
export function cutout(blob, progress = () => {}) {
  worker ||= new Worker(new URL('./background.worker.js', import.meta.url), { type:'module' });
  return new Promise((resolve,reject) => {
    const timeout = setTimeout(() => { worker.terminate();worker=undefined;reject(new Error('Processing timed out. Check your connection and try again.')); }, 240000);
    worker.onmessage = ({data}) => {
      if(data.type === 'progress') { progress(data.key,data.current,data.total);return; }
      clearTimeout(timeout);
      if(data.type === 'done') resolve(data.blob);
      else { worker.terminate();worker=undefined;reject(new Error(data.message)); }
    };
    worker.onerror = () => { clearTimeout(timeout);worker.terminate();worker=undefined;reject(new Error('The background removal engine could not start. Please retry.')); };
    worker.postMessage(blob);
  });
}
