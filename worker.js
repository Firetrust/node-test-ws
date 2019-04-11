const API = {
  endpoint: 'http://api.exerflysport.com'
}

async function request () {
  const response = await fetch(`${API.endpoint}/count`)
  if (!response.ok) {
    throw new Error(
      `API error ${response.url}: ${response.statusText} (${response.status})`)
  }
  return response.json()
}

onmessage = () => {
  console.log('Posting message back to main script')
  request().then((res) => {
    postMessage(JSON.stringify(res))
  }).catch((err) => {
    console.error('Error during request', err)
    postMessage(JSON.stringify(err))
  })
}
