# to compile the project on mac

```
brew install libjpeg

export LDFLAGS="-L/opt/homebrew/opt/jpeg/lib"
export CPPFLAGS="-I/opt/homebrew/opt/jpeg/include"

npm i 
npm run build
```