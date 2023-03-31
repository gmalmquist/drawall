class ImageExporter {
  downloadCanvasComposite() {
    const canvases = Array.from(App.pane.children)
      .filter(c => c.tagName.toLocaleLowerCase() === 'canvas')
      .map(c => c as HTMLCanvasElement);
    const first = canvases[0]!;

    const compositing = document.createElement('canvas');
    compositing.width = first.width;
    compositing.height = first.height;
    compositing.style.width = `${first.width}px`;
    compositing.style.height = `${first.height}px`;
    compositing.style.opacity = '0';
    compositing.style.position = 'absolute';
    compositing.style.pointerEvents = 'none';

    const dataUrls = canvases.map(c => c.toDataURL('image/png'));
    const loaded: Array<boolean> = new Array(dataUrls.length).fill(false);
    const images: Array<HTMLImageElement> = [];

    const renderComposite = () => {
      document.body.prepend(compositing);
      const g = compositing.getContext('2d')!;
      for (const image of images) {
        g.drawImage(image, 0, 0, image.width, image.height);
      }
      
      const download = document.createElement('a');
      download.style.position = 'absolute';
      download.style.opacity = '0';
      download.href = compositing.toDataURL('image/png');
      download.download = 'drawall-floor-plan.png';
      document.body.prepend(download);
      download.click();
      document.body.removeChild(download);
      document.body.removeChild(compositing);
    };

    dataUrls.forEach((url, i) => {
      const image = new Image();
      image.onload = () => {
        loaded[i] = true;
        if (loaded.every(b => b)) {
          renderComposite();
        }
      };
      image.src = url;
      images.push(image);
    });
  }
}
