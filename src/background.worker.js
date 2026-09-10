import { removeBackground } from '@imgly/background-removal';
self.onmessage = async ({ data }) => {
  try {
    const blob = await removeBackground(data, {
      model: 'isnet_quint8', device: 'cpu', proxyToWorker: false,
      output: { format: 'image/png' },
      progress: (key,current,total) => self.postMessage({ type:'progress',key,current,total }),
    });
    self.postMessage({ type:'done',blob });
  } catch(e) { self.postMessage({ type:'error',message:e.message }); }
};
