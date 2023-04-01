class ImageExporter {
  private static readonly NOOP = () => {/* noop */};
  private readyListener: (() => void) = ImageExporter.NOOP;

  public setup() {
    App.renderReady.onChange(ready => {
      if (ready) {
        this.readyListener();
        this.readyListener = ImageExporter.NOOP;
      }
    });
  }

  private onReady(f: () => void) {
    if (App.renderReady.get()) {
      f();
      this.readyListener = ImageExporter.NOOP;
      return;
    }
    this.readyListener = f;
  }

  export() {
    App.renderReady.set(false);
    App.rendering.set(true);

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

    this.onReady(() => {
      const dataUrls = canvases.map(c => c.toDataURL('image/png'));
      const loaded: Array<boolean> = new Array(dataUrls.length).fill(false);
      const images: Array<HTMLImageElement> = [];

      const renderComposite = () => {
        App.rendering.set(false);
        document.body.prepend(compositing);
        const g = compositing.getContext('2d')!;

        for (let i = 0; i < images.length; i++) {
          const canvasImage = images[i];
          g.drawImage(canvasImage, 0, 0, canvasImage.width, canvasImage.height);

          if (i === 0) {
            // now draw the html images
            App.ecs.getComponents(Imaged).forEach(m => {
              const pos = m.position.get().get('screen');
              const width = m.width.get().get('screen');
              const height = m.height.get().get('screen');
              g.drawImage(m.image, pos.x, pos.y, width, height);
            });
          }
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
    });
  }
}

