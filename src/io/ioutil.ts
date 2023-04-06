class IoUtil {
  public download(filename: string, dataUrl: URL | string) {
    const download = document.createElement('a');
    download.href = dataUrl.toString();
    download.download = filename;
    App.uiJail.appendChild(download);
    download.click();
    download.parentNode?.removeChild(download);
  }

  public open(extensions: string[], callback: (url: URL | string) => void) {
    const element = document.createElement('input') as HTMLInputElement;
    element.setAttribute('type', 'file');
    element.setAttribute('accept', extensions.join(', '));
    element.style.position = 'absolute';
    element.style.opacity = '0';
    App.uiJail.appendChild(element);
    element.addEventListener('change', () => {
      const files = Array.from(element.files || []);
      for (const file of files) {
        callback(URL.createObjectURL(file));
        break;
      }
    });
    element.click();
    element.parentNode?.removeChild(element);
  }
}

