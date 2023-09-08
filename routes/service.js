import express from 'express'
import axios from 'axios'
import cheerio from 'cheerio'
import admZip from 'adm-zip'
import {Readable} from 'stream'

const router = express.Router()

// Search movie subtitle
router.get('/search/movie/:lang/:movieName', getMovie)
// Read movie subtitle
router.get('/search/:movieName/:lang/:totLink/:num/readSubtitle', readMovieSubtitle)
// Search tv show subtitle
router.get('/search/show/:lang/:showName', getShow)
// Read show subtitle
router.get('/search/:showName/:season/:episode/:lang/:totLink/:num/readShowSubtitle', readShowSubtitle)

async function readShowSubtitle(req,res) {
  const paramLang =  req.params.lang // req.query.lang.split('.')[0]
  const listData = req.query.listData
  const season = req.params.season
  const episode = req.params.episode
  try {
      if(paramLang) {
          const totalLink = req.params.totLink
          let showName = req.params.showName
          if(season && episode) {
            showName = showName + `-S0${season}E0${episode}`
          }
          const showId = await getId(showName,paramLang);
          const showData = await getSubtitleInfo(showId,paramLang,totalLink) 
          if(listData) {
            res.json(showData)
            return
          }
          const linkNum = showData.links.length <= req.params.num ? showData.links.length - 1 : req.params.num  
          const url = showData.links[linkNum].downloadLink.split('-')[1]
          const options =  { 
              method: 'GET',
              url,
              responseType: "arraybuffer"
          };
          const { data } = await axios(options);
          const zip = new admZip(data)
          const entries = zip.getEntries() 
          let srtFileStream = null 
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  
          for (const entry of entries) {
            if (entry.entryName.endsWith('.srt')) { 
              const buffer = entry.getData() 
              srtFileStream = Readable.from(buffer.toString('utf-8'))
              break
            }
          } 
          
          if(srtFileStream) {
              srtFileStream.pipe(res)
          } else {
              res.status(404).send('SRT file not found in the zip archive.')
          }
      } else {
          res.status(404).send('No subtitle found in this language!')
      }
      
  } catch (err) {
      console.log(err)
      res.status(500).send('Internal server error');
  }
}

async function readMovieSubtitle(req,res) {
  const paramLang =  req.params.lang //req.query.lang.split('.')[0]
  try {
      if(paramLang) {
          const totalLink = req.params.totLink
          const movieName = req.params.movieName;
          const movieId = await getId(movieName,paramLang);
          const movieData = await getSubtitleInfo(movieId,paramLang,totalLink) 
          const linkNum = movieData.links.length <= req.params.num ? movieData.links.length - 1 : req.params.num  
          const url = movieData.links[linkNum].downloadLink.split('-')[1]
          const options =  { 
              method: 'GET',
              url,
              responseType: "arraybuffer"
          };
          const { data } = await axios(options);
          const zip = new admZip(data)
          const entries = zip.getEntries() 
          let srtFileStream = null 
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  
          for (const entry of entries) {
            if (entry.entryName.endsWith('.srt')) { 
              const buffer = entry.getData() 
              srtFileStream = Readable.from(buffer.toString('utf-8'))
              break
            }
          } 
          
          if(srtFileStream) {
              srtFileStream.pipe(res)
          } else {
              res.status(404).send('SRT file not found in the zip archive.')
          }
      } else {
          res.status(404).send('No subtitle found in this language!')
      }
      
  } catch (err) {
      console.log(err)
      res.status(500).send('Internal server error');
  }
}

async function getMovie (req, res) { 
    // @param url: api/search/tur/the-platform
    // @param queries: totalLink=number

    let queryTotalLink = req.query.totalLink
    if(!queryTotalLink) {
        queryTotalLink = 3
    } 
    try {
      const paramLang = req.params.lang
      const movieName = req.params.movieName;
      const movieId = await getId(movieName,paramLang);
      if (!movieId) {
        throw new Error('Movie not found');
      }
      
      const subtitleInfo = await getSubtitleInfo(movieId,paramLang,queryTotalLink); 
      res.json(subtitleInfo);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
}

async function getShow (req, res) { 
  // @param url: api/search/lang*/the-platform[?totalLink=number]

  let queryTotalLink = req.query.totalLink
  if(!queryTotalLink) {
      queryTotalLink = 3
  } 
  try {
    const paramLang = req.params.lang
    const showName = req.params.showName;
    const showId = await getId(showName,paramLang);
    if (!showId) {
      throw new Error('Movie not found');
    }
    
    const subtitleInfo = await getSubtitleInfo(showId,paramLang,queryTotalLink); 
    res.json(subtitleInfo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function getId(mediaName,lang,show) {
    const searchUrl = `https://www.opensubtitles.org/en/search2/moviename-${mediaName}/sublanguageid-${lang}/sort-3/asc-0`;
    try {
      const searchResponse = await axios.get(searchUrl);
      const $ = cheerio.load(searchResponse.data);
      const mediaLink = $('.bnone').attr('href');  
      if (!mediaLink) {
        return null;
      }

      const mediaId = mediaLink.match(/\/idmovie-(\d+)/);
      if (!mediaId || mediaId.length < 2) {
        return null;
      }
      
      return mediaId[1];
    } catch (error) {
      throw new Error('Movie search failed');
    }
}
  
async function getSubtitleInfo(mediaId,lang,totalLink) {
    const searchUrl = `https://www.opensubtitles.org/en/search/sublanguageid-${lang}/idmovie-${mediaId}`
    const siteUrl = 'https://www.opensubtitles.org'
    try {
      const movieResponse = await axios.get(searchUrl)
      const $ = cheerio.load(movieResponse.data) 
      const singleDwLink = $('#bt-dwl-bt').attr('href')
      if(!singleDwLink) {
        const textH1 = $('.msg h1').text().trim().split(' ')
        let downloadPageLinks = [] 
        let episodePages = {}
        const index =  textH1.indexOf('subtitles')
        let title = lang.split(',').length > 1 ? textH1.slice(0,index).join(' ') : textH1.slice(0,-1).join(' ') 
        let language = lang.split(',').length > 1 ? textH1.slice(index+1).join(' ') : textH1.slice(-1).join(' ')
        let links    
        const findLinks = $('.bnone').each((index,element) => {
          downloadPageLinks.push(siteUrl + element.attribs.href)
        }); 
        
        if (downloadPageLinks.length < 1) {
          language =  lang.split(',').length > 1 ? textH1.slice(-index+1,-1).join('') : textH1.slice(-2)[0]
          title = lang.split(',').length > 1 ? textH1.slice(0,lang.split(',').length).join(' ') : textH1.slice(0,-1).join(' ') 
          let currentSeason = null; 

          const allLinks = $('td a[itemprop="url"]').each((i, element) => {
            const href = element.attribs.href;
            const seasonMatch = href.match(/season-(\d+)/);
          
            if (seasonMatch) {
              const seasonNumber = seasonMatch[1];
              currentSeason = `season-${seasonNumber}`;
              episodePages[currentSeason] = [];
            } else if (currentSeason) {
              episodePages[currentSeason].push(siteUrl + href);
            }
          });
          links = episodePages
        } else {
          links = await Promise.all(downloadPageLinks.slice(0,totalLink).map(async (link) => await getDownloadLink(link)))
        }
        return { title,pageLink:searchUrl,language, links};
      } else {
        // For tv show page data
        return {links:[{downloadLink: `${lang}-` + 'https://www.opensubtitles.org'+ singleDwLink}]}
      }
        
    } catch (error) { 
      throw new Error('Failed to fetch movie page')
    }
}

async function getDownloadLink(subtitlePageLink) {
    try {
      const subtitleResponse = await axios.get(subtitlePageLink);
      const $ = cheerio.load(subtitleResponse.data);
      const langShort = {
        en: 'eng',
        tr:'tur',
        ar:'ara',
        ru: 'rus'
      }
      const downloadLink = `${langShort[subtitlePageLink.slice(-2)]}-` + 'https://www.opensubtitles.org' + $('#bt-dwl-bt').attr('href'); 
      if (!downloadLink) {
        throw new Error('Download link not found');
      } 
      return {downloadLink };
    } catch (error) {
      throw new Error('Failed to fetch subtitle page');
    }
}

export default router