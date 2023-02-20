function changeBackgroundColor() {
    const currentTime = new Date().getHours();
    const body = document.querySelector('body');
    if (currentTime < 12) {
      body.style.backgroundColor = 'lightblue';
    } else if (currentTime < 18) {
      body.style.backgroundColor = 'green';
    } else {
      body.style.backgroundColor = 'purple';
    }
  }